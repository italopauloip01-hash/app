// Supabase em memória: implementa só o que a camada de sync usa, reproduzindo os
// comportamentos do Supabase real que importam para não perder dados.
type Row = Record<string, unknown>;
type RealtimeHandler = (payload: { eventType: string; table: string; new: Row | null; old: Row | null }) => Promise<void> | void;

export function createFakeSupabase() {
    const tables = new Map<string, Map<string, Row>>();
    const state = {
        userId: 'user-1' as string | null,
        failUpserts: false,
        upsertCalls: 0,
        realtimeHandler: null as RealtimeHandler | null,
        /** Colunas que "não existem" na tabela (migração não aplicada) */
        missingColumns: {} as Record<string, string[]>,
    };

    const table = (name: string) => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };

    const client = {
        auth: {
            getSession: async () => ({
                data: { session: state.userId ? { user: { id: state.userId } } : null },
            }),
        },
        from(name: string) {
            const t = table(name);
            const visible = () => [...t.values()].filter(r => r.user_id === state.userId);
            return {
                async upsert(rows: Row[], opts: { onConflict: string }) {
                    state.upsertCalls++;
                    if (state.failUpserts) return { error: { message: 'falha simulada' } };
                    // Como o PostgREST quando a coluna não existe
                    const missing = (state.missingColumns[name] ?? []).find(col => rows.some(r => col in r));
                    if (missing) return { error: { code: 'PGRST204', message: `Could not find the '${missing}' column of '${name}' in the schema cache` } };
                    // Como o PostgREST: as colunas do lote são a união das chaves de todas as
                    // linhas; numa linha sem a chave, a coluna é gravada como NULL.
                    const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
                    for (const row of rows) {
                        const key = String(row[opts.onConflict]);
                        const existing = t.get(key) ?? {};
                        const updated: Row = { ...existing };
                        for (const col of columns) updated[col] = col in row ? row[col] : null;
                        // Serializa como o banco (datas viram string)
                        t.set(key, JSON.parse(JSON.stringify(updated)));
                    }
                    return { error: null };
                },
                delete() {
                    return {
                        async in(_col: string, ids: string[]) {
                            for (const [key, row] of t) if (ids.includes(String(row.id))) t.delete(key);
                            return { error: null };
                        },
                    };
                },
                select() {
                    return {
                        order() {
                            return {
                                async range(from: number, to: number) {
                                    const all = visible().sort((a, b) => String(a.id).localeCompare(String(b.id)));
                                    return { data: all.slice(from, to + 1), error: null };
                                },
                            };
                        },
                        eq(_col: string, value: unknown) {
                            return {
                                async maybeSingle() {
                                    return { data: visible().find(r => r.id === value) ?? null, error: null };
                                },
                            };
                        },
                    };
                },
            };
        },
        channel() {
            const ch = {
                on: (_type: string, _filter: unknown, handler: RealtimeHandler) => {
                    state.realtimeHandler = handler;
                    return ch;
                },
                subscribe: () => ch,
            };
            return ch;
        },
        removeChannel() { /* noop */ },
    };

    return { client, state, table };
}
