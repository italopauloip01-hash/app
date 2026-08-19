/**
 * Utility to parse a YYYY-MM-DD string as a local Date object.
 * This prevents the timezone offset bug where new Date('2026-02-12') 
 * is interpreted as UTC and shifts back one day in some timezones.
 */
export const parseLocalDate = (dateString: string | Date | any): Date => {
    if (!dateString) return new Date();
    // Se já for Date e for válido, retorne ele.
    if (dateString instanceof Date) {
        return isNaN(dateString.getTime()) ? new Date() : dateString;
    }

    if (typeof dateString !== 'string') return new Date();

    try {
        const parts = dateString.split('-');
        if (parts.length < 3) return new Date(dateString); // Try native parse as fallback

        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10); // isso já corta o "T"

        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            const fallback = new Date(dateString);
            return isNaN(fallback.getTime()) ? new Date() : fallback;
        }

        return new Date(year, month - 1, day);
    } catch (error) {
        return new Date();
    }
};

/**
 * Formats a Date object as a local dd/mm/yyyy string.
 */
export const formatLocalDate = (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR');
};

export const formatSimpleDate = (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const getYearMonth = (date: Date | string | number | any): string => {
    if (!date) return '';
    if (typeof date === 'string' && date.includes('-')) {
        const parts = date.split('-');
        if (parts.length >= 2) {
            const year = parts[0].trim();
            const month = parts[1].padStart(2, '0');
            return `${year}-${month}`;
        }
    }
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
