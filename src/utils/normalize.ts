import { parseLocalDate, parseMonetaryValue } from './dateUtils';

/**
 * Registros vindos do Supabase (sync/realtime) chegam com datas como string ISO,
 * números às vezes como string e JSON às vezes serializado. Registros criados no
 * aparelho usam Date/number/array. Essa mistura faz filtros por mês e somas falharem,
 * então tudo que entra no Dexie passa por aqui e fica sempre no mesmo formato.
 */

// Campos que representam um dia do calendário (sem hora relevante)
const DAY_FIELDS = ['date', 'nextServiceDate'];
// Campos que representam um instante (hora importa)
const TIMESTAMP_FIELDS = ['createdAt', 'reminderIgnoredAt'];
const MONEY_FIELDS = ['price', 'amount', 'total'];
const JSON_ARRAY_FIELDS = ['items', 'photos', 'photosBefore', 'photosAfter'];

function parseJsonArray(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function normalizeRecord<T extends Record<string, unknown>>(record: T): T {
    const out: Record<string, unknown> = { ...record };

    for (const key of DAY_FIELDS) {
        const v = out[key];
        if (v !== null && v !== undefined && v !== '') out[key] = parseLocalDate(v);
    }

    for (const key of TIMESTAMP_FIELDS) {
        const v = out[key];
        if (typeof v === 'string' || typeof v === 'number') {
            const d = new Date(v);
            if (!isNaN(d.getTime())) out[key] = d;
        }
    }

    for (const key of MONEY_FIELDS) {
        if (key in out && out[key] !== undefined) out[key] = parseMonetaryValue(out[key]);
    }

    for (const key of JSON_ARRAY_FIELDS) {
        if (!(key in out) || out[key] === null || out[key] === undefined) continue;
        const arr = parseJsonArray(out[key]);
        if (arr) out[key] = arr;
    }

    if (Array.isArray(out.items)) {
        out.items = (out.items as Record<string, unknown>[]).map(item => ({
            ...item,
            price: parseMonetaryValue(item?.price),
            quantity: Number(item?.quantity) || 1,
        }));
    }

    return out as T;
}
