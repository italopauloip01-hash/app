/**
 * Agenda: duração estimada dos serviços, ocupação do dia, choques de horário e
 * sugestão de horários livres. Funções puras (sem banco), para poder testar.
 */
import { format } from 'date-fns';
import { getServicePrice, parseLocalDate, parseMonetaryValue } from './dateUtils';

export const DEFAULT_WORK_START = '08:00';
export const DEFAULT_WORK_END = '18:00';
/** Tempo entre um cliente e outro (deslocamento, montar/desmontar). */
export const DEFAULT_TRAVEL_MINUTES = 30;

// Duração padrão por tipo de serviço, quando o serviço padrão não tem tempo definido
const DURATION_RULES: { match: RegExp; minutes: number }[] = [
    { match: /desinstala/i, minutes: 90 },
    { match: /instala/i, minutes: 180 },
    { match: /(conserto|reparo|repara|carga de g[aá]s|vazamento)/i, minutes: 120 },
    { match: /manuten/i, minutes: 90 },
    { match: /(limpeza|higieniza)/i, minutes: 60 },
    { match: /(visita|or[cç]amento|avalia)/i, minutes: 45 },
];
const FALLBACK_MINUTES = 60;

export interface DurationItem {
    type?: string;
    description?: string;
    quantity?: number | string;
}

export interface DurationTemplate {
    name: string;
    durationMinutes?: number;
}

/** Duração de um item: tempo do serviço padrão de mesmo nome, ou regra pelo tipo. */
export function itemDuration(item: DurationItem, templates: DurationTemplate[] = []): number {
    const name = (item.type || '').trim().toLowerCase();
    const template = templates.find(t => t.name.trim().toLowerCase() === name);
    if (template?.durationMinutes && template.durationMinutes > 0) return template.durationMinutes;
    const text = `${item.type || ''} ${item.description || ''}`;
    return DURATION_RULES.find(r => r.match.test(text))?.minutes ?? FALLBACK_MINUTES;
}

/** Duração total estimada: soma dos itens x quantidade. */
export function estimateDuration(items: DurationItem[], templates: DurationTemplate[] = []): number {
    const total = items.reduce((sum, item) => sum + itemDuration(item, templates) * (Number(item.quantity) || 1), 0);
    return total || FALLBACK_MINUTES;
}

export const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (minutes: number): string => {
    const m = Math.max(0, Math.round(minutes));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** "2h30", "45 min" */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export interface SchedulableService {
    id?: string;
    date: unknown;
    startTime?: string | null;
    durationMinutes?: number | null;
    status?: string;
    items?: DurationItem[];
    type?: string;
    description?: string;
}

export interface Block<T = SchedulableService> {
    start: number; // minutos desde 00:00
    end: number;
    service: T;
}

export const dayKey = (date: unknown): string => format(parseLocalDate(date), 'yyyy-MM-dd');

/** Duração do serviço: a gravada nele, ou estimada pelos itens. */
export function serviceDuration(s: SchedulableService, templates: DurationTemplate[] = []): number {
    if (s.durationMinutes && s.durationMinutes > 0) return s.durationMinutes;
    const items = s.items?.length ? s.items : [{ type: s.type, description: s.description, quantity: 1 }];
    return estimateDuration(items, templates);
}

/** Serviços com horário marcado no dia, em ordem (cancelados não ocupam a agenda). */
export function dayBlocks<T extends SchedulableService>(
    services: T[], day: string, templates: DurationTemplate[] = [], excludeId?: string,
): Block<T>[] {
    return services
        .filter(s => s.startTime && s.status !== 'Cancelado' && s.id !== excludeId && dayKey(s.date) === day)
        .map(s => {
            const start = toMinutes(s.startTime!);
            return { start, end: start + serviceDuration(s, templates), service: s };
        })
        .sort((a, b) => a.start - b.start);
}

/** Serviços cujo horário (com folga de deslocamento) se sobrepõe ao intervalo pedido. */
export function findConflicts<T>(blocks: Block<T>[], start: number, duration: number, travel = DEFAULT_TRAVEL_MINUTES): Block<T>[] {
    const end = start + duration;
    return blocks.filter(b => start < b.end + travel && b.start < end + travel);
}

/**
 * Horários livres no expediente onde cabe um serviço da duração pedida,
 * respeitando o deslocamento antes e depois de cada serviço já marcado.
 */
export function suggestSlots<T>(
    blocks: Block<T>[], duration: number,
    workStart = DEFAULT_WORK_START, workEnd = DEFAULT_WORK_END,
    travel = DEFAULT_TRAVEL_MINUTES, step = 30,
): string[] {
    const open = toMinutes(workStart);
    const close = toMinutes(workEnd);
    const slots: string[] = [];
    for (let t = open; t + duration <= close; t += step) {
        if (findConflicts(blocks, t, duration, travel).length === 0) slots.push(fromMinutes(t));
    }
    return slots;
}

/** Livres em faixas contínuas (para mostrar "livre das 13:00 às 18:00"). */
export function freeRanges<T>(
    blocks: Block<T>[], workStart = DEFAULT_WORK_START, workEnd = DEFAULT_WORK_END, travel = DEFAULT_TRAVEL_MINUTES,
): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    let cursor = toMinutes(workStart);
    const close = toMinutes(workEnd);
    for (const b of blocks) {
        const busyFrom = b.start - travel;
        if (busyFrom - cursor >= 30) ranges.push({ start: cursor, end: Math.min(busyFrom, close) });
        cursor = Math.max(cursor, b.end + travel);
    }
    if (close - cursor >= 30) ranges.push({ start: cursor, end: close });
    return ranges.filter(r => r.end > r.start);
}

export interface DayEarnings {
    total: number; // valor de todos os serviços do dia (exceto cancelados)
    received: number; // já pagos
    pending: number; // a receber
    helperCost: number; // trabalho de ajudantes lançado no dia
    profit: number; // total - custo de ajudantes
    count: number;
}

/** Ganho do dia: soma dos serviços (pagos e a receber) menos o custo de ajudantes. */
export function dayEarnings(
    services: { date: unknown; status?: string; paymentStatus?: string; items?: unknown; price?: unknown }[],
    helperEntries: { date: unknown; type: string; amount: unknown }[],
    day: string,
): DayEarnings {
    const ofDay = services.filter(s => s.status !== 'Cancelado' && dayKey(s.date) === day);
    let received = 0, pending = 0;
    for (const s of ofDay) {
        const value = getServicePrice(s);
        if (s.paymentStatus === 'Pago') received += value;
        else pending += value;
    }
    const helperCost = helperEntries
        .filter(e => e.type === 'work' && dayKey(e.date) === day)
        .reduce((sum, e) => sum + parseMonetaryValue(e.amount), 0);
    const total = received + pending;
    return { total, received, pending, helperCost, profit: total - helperCost, count: ofDay.length };
}

/** Minutos ocupados no dia (serviços + deslocamentos entre eles). */
export function bookedMinutes<T>(blocks: Block<T>[], travel = DEFAULT_TRAVEL_MINUTES): number {
    if (blocks.length === 0) return 0;
    const work = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
    return work + travel * (blocks.length - 1);
}
