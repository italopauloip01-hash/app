/**
 * Converte qualquer formato de data (ISO, DD/MM/YYYY, Timestamp, Date, UTC) 
 * para um Date local exato sem bugs de fuso horário.
 */
export const parseLocalDate = (dateInput: any): Date => {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return new Date();
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }

    if (typeof dateInput === 'number') {
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? new Date() : d;
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

    // Formato ISO: YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss
    if (cleanStr.includes('-')) {
        const parts = cleanStr.split('T')[0].split('-');
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
    return isNaN(fallback.getTime()) ? new Date() : fallback;
};

/**
 * Formats a Date object as a local dd/mm/yyyy string safely.
 */
export const formatLocalDate = (date: any): string => {
    if (!date) return '';
    const d = parseLocalDate(date);
    return d.toLocaleDateString('pt-BR');
};

/**
 * Formats date as dd/mm safely.
 */
export const formatSimpleDate = (date: any): string => {
    if (!date) return '';
    const d = parseLocalDate(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/**
 * Returns YYYY-MM safely from any date representation.
 */
export const getYearMonth = (date: any): string => {
    if (!date) return '';

    if (date instanceof Date) {
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
        // YYYY-MM-DD
        if (clean.includes('-')) {
            const parts = clean.split('T')[0].split('-');
            if (parts.length >= 2) {
                const year = parts[0].trim();
                const month = parts[1].padStart(2, '0');
                return `${year}-${month}`;
            }
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
