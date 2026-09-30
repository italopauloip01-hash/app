// Supabase em memória: implementa só o que a camada de sync usa.
type Row = Record<string, unknown>;

export function createFakeSupabase() {
    const tables = new Map<string, Map<string, Row>>();
    const state = { userId: 'user-1' as string | null, failUpserts: false, upsertCalls: 0 };

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
            return {
                async upsert(rows: Row[], opts: { onConflict: string }) {
                    state.upsertCalls++;
                    if (state.failUpserts) return { error: { message: 'falha simulada' } };
                    for (const row of rows) {
                        const key = String(row[opts.onConflict]);
                        // Simula o banco: serializa (datas viram string, como no Postgres)
                        t.set(key, JSON.parse(JSON.stringify(row)));
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
                                    const all = [...t.values()]
                                        .filter(r => r.user_id === state.userId)
                                        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
                                    return { data: all.slice(from, to + 1), error: null };
                                },
                            };
                        },
                    };
                },
            };
        },
        channel() {
            const ch = { on: () => ch, subscribe: () => ch };
            return ch;
        },
        removeChannel() { /* noop */ },
    };

    return { client, state, table };
}
