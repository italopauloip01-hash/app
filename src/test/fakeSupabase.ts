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
        /** Quantas linhas com fotos (base64) foram baixadas — para medir o peso do sync */
        photoRowsDownloaded: 0,
        realtimeHandler: null as RealtimeHandler | null,
        /** Colunas que "não existem" na tabela (migração não aplicada) */
        missingColumns: {} as Record<string, string[]>,
    };
    const PHOTO_COLUMNS = ['photos', 'photos_before', 'photos_after'];

    const table = (name: string) => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };

    // Consulta encadeável: select(colunas).in/eq/order/range/limit/abortSignal, e await no fim
    function query(name: string, columns: string) {
        const filters: ((r: Row) => boolean)[] = [(r) => r.user_id === state.userId];
        let range: [number, number] | null = null;
        let limit: number | null = null;
        let single = false;

        const run = () => {
            let rows = [...table(name).values()].filter(r => filters.every(f => f(r)))
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (range) rows = rows.slice(range[0], range[1] + 1);
            if (limit !== null) rows = rows.slice(0, limit);
            const project = (r: Row) => {
                if (columns === '*') return { ...r };
                const out: Row = {};
                for (const c of columns.split(',')) if (c in r) out[c] = r[c];
                return out;
            };
            const data = rows.map(project);
            if (data.some(r => PHOTO_COLUMNS.some(c => Array.isArray(r[c]) && (r[c] as unknown[]).length > 0))) {
                state.photoRowsDownloaded += data.filter(r => PHOTO_COLUMNS.some(c => Array.isArray(r[c]) && (r[c] as unknown[]).length > 0)).length;
            }
            return single ? { data: data[0] ?? null, error: null } : { data, error: null };
        };

        const builder = {
            in(col: string, values: unknown[]) { filters.push(r => values.includes(r[col])); return builder; },
            eq(col: string, value: unknown) { filters.push(r => r[col] === value); return builder; },
            order() { return builder; },
            range(from: number, to: number) { range = [from, to]; return builder; },
            limit(n: number) { limit = n; return builder; },
            abortSignal() { return builder; },
            maybeSingle() { single = true; return builder; },
            then<T>(resolve: (v: ReturnType<typeof run>) => T) { return Promise.resolve(run()).then(resolve); },
        };
        return builder;
    }

    const client = {
        auth: {
            getSession: async () => ({
                data: { session: state.userId ? { user: { id: state.userId } } : null },
            }),
        },
        from(name: string) {
            const t = table(name);
            return {
                upsert(rows: Row[], opts: { onConflict: string }) {
                    const exec = () => {
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
                    };
                    const b = {
                        abortSignal() { return b; },
                        then<T>(resolve: (v: ReturnType<typeof exec>) => T) { return Promise.resolve(exec()).then(resolve); },
                    };
                    return b;
                },
                delete() {
                    return {
                        in(_col: string, ids: string[]) {
                            const exec = () => {
                                for (const [key, row] of t) if (ids.includes(String(row.id))) t.delete(key);
                                return { error: null };
                            };
                            const b = {
                                abortSignal() { return b; },
                                then<T>(resolve: (v: ReturnType<typeof exec>) => T) { return Promise.resolve(exec()).then(resolve); },
                            };
                            return b;
                        },
                    };
                },
                select(columns = '*') {
                    return query(name, columns);
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
