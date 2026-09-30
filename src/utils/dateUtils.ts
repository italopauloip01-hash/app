/**
 * Converte qualquer formato de data (ISO, DD/MM/YYYY, Timestamp, Date, UTC) 
 * para um Date local exato sem bugs de fuso horário.
 */
export const parseLocalDate = (dateInput: unknown): Date => {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return new Date();
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }

    if (typeof dateInput === 'number') {
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? new Date() : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    if (typeof dateInput !== 'string') return new Date();

    const cleanStr = dateInput.trim();

    // Formato Brasileiro: DD/MM/YYYY
    if (cleanStr.includes('/')) {
        const parts = cleanStr.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month - 1, day);
            }
        }
    }

    // Se tiver indicador de hora UTC/ISO (T ou Z), converte respeitando o fuso local do navegador
    if (cleanStr.includes('T') || cleanStr.includes('Z')) {
        const d = new Date(cleanStr);
        if (!isNaN(d.getTime())) {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
    }

    // Formato ISO puro simples: YYYY-MM-DD
    if (cleanStr.includes('-')) {
        const parts = cleanStr.split('-');
        if (parts.length >= 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month - 1, day);
            }
        }
    }

    const fallback = new Date(dateInput);
    return isNaN(fallback.getTime()) ? new Date() : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
};

/**
 * Formats a Date object as a local dd/mm/yyyy string safely.
 */
export const formatLocalDate = (date: unknown): string => {
    if (!date) return '';
    const d = parseLocalDate(date);
    return d.toLocaleDateString('pt-BR');
};

/**
 * Formats date as dd/mm safely.
 */
export const formatSimpleDate = (date: unknown): string => {
    if (!date) return '';
    const d = parseLocalDate(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/**
 * Returns YYYY-MM safely from any date representation, sem pular ou errar mês por timezone.
 */
export const getYearMonth = (date: unknown): string => {
    if (!date) return '';

    if (date instanceof Date) {
        if (isNaN(date.getTime())) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    if (typeof date === 'string') {
        const clean = date.trim();
        // DD/MM/YYYY
        if (clean.includes('/')) {
            const parts = clean.split('/');
            if (parts.length === 3) {
                const month = parts[1].padStart(2, '0');
                const year = parts[2].substring(0, 4);
                return `${year}-${month}`;
            }
        }
        // Se for string pura YYYY-MM-DD (sem hora T)
        if (clean.includes('-') && !clean.includes('T') && !clean.includes('Z')) {
            const parts = clean.split('-');
            if (parts.length >= 2) {
                const year = parts[0].trim();
                const month = parts[1].padStart(2, '0');
                return `${year}-${month}`;
            }
        }
    }

    // Para strings ISO completas (com T/Z) ou outros formatos, passa pelo parseLocalDate
    const d = parseLocalDate(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

export const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Returns month name in Portuguese explicitly (e.g. "Agosto")
 */
export const getMonthName = (yearMonth: string): string => {
    if (!yearMonth) return '';
    const parts = yearMonth.split('-');
    if (parts.length >= 2) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            return MONTH_NAMES_PT[monthIndex];
        }
    }
    return '';
};

/**
 * Returns year string (e.g. "2026")
 */
export const getYearFromYearMonth = (yearMonth: string): string => {
    if (!yearMonth) return '';
    return yearMonth.split('-')[0];
};

/**
 * Converte qualquer representação numérica ou em string (ex: "150,00", "1.250,50", "R$ 300,00", null, NaN)
 * em um número Float válido com 0 como fallback absoluto.
 */
export const parseMonetaryValue = (val: unknown): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'string') {
        let clean = val.replace(/R\$\s?/g, '').trim();
        if (clean.includes('.') && clean.includes(',')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else if (clean.includes(',')) {
            clean = clean.replace(',', '.');
        }
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }
    return 0;
};

/**
 * Obtém com segurança o valor real de um serviço, considerando soma dos itens ou preço direto.
 */
interface PricedService {
    items?: unknown;
    price?: unknown;
}

export const getServicePrice = (service: PricedService | null | undefined): number => {
    if (!service) return 0;

    // Se o serviço tiver itens com valor, calcula a soma dos itens
    if (Array.isArray(service.items) && service.items.length > 0) {
        const items = service.items as { price?: unknown; quantity?: unknown }[];
        const itemsTotal = items.reduce((total, item) => {
            const itemPrice = parseMonetaryValue(item?.price);
            const qty = Number(item?.quantity) || 1;
            return total + (itemPrice * qty);
        }, 0);
        if (itemsTotal > 0) return itemsTotal;
    }

    // Se não tiver itens ou itemsTotal deu 0, usa service.price
    return parseMonetaryValue(service.price);
};

/**
 * Formata um valor numérico em moeda brasileira de forma 100% blindada contra crash.
 */
export const formatCurrency = (val: unknown): string => {
    const num = parseMonetaryValue(val);
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
