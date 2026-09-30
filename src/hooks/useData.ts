import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CompanySettings } from '../types';
import { getYearMonth, parseLocalDate, getServicePrice, parseMonetaryValue } from '../utils/dateUtils';
import { format } from 'date-fns';

// ============================================
// Exported Hooks (Pure Local / Dexie)
// ============================================

export function useClients() {
    return useLiveQuery(() => db.clients.orderBy('name').toArray());
}

export function useHelpers() {
    return useLiveQuery(() => db.helpers.orderBy('name').toArray());
}

export function useClient(id: string) {
    return useLiveQuery(() => db.clients.get(id), [id]);
}

export function useServices(clientId?: string) {
    return useLiveQuery(async () => {
        if (clientId) {
            // where+equals é mais rápido que toArray+filter porque usa o índice
            const results = await db.services
                .where('clientId')
                .equals(clientId)
                .toArray();
            // Ordena em memória (apenas os registros do cliente, não tudo)
            return results.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        } else {
            return await db.services
                .orderBy('date')
                .reverse()
                .toArray();
        }
    }, [clientId]);
}

export function useServiceTemplates() {
    return useLiveQuery(() => db.serviceTemplates.orderBy('name').toArray());
}

export function useReminders(includeIgnored: boolean = false) {
    return useLiveQuery(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [allServices, clients] = await Promise.all([
            db.services.toArray(),
            db.clients.toArray()
        ]);

        const clientMap = new Map(clients.map(c => [c.id!, c]));

        // Filtra se queremos os ativos ou os ignorados
        const filteredServices = allServices.filter(s => {
            if (includeIgnored) {
                return s.reminderIgnored === true || s.status === 'Cancelado';
            }
            return s.reminderIgnored !== true && s.status !== 'Cancelado';
        });

        // Latest completed service per client
        const latestCompletedPerClient = new Map<string, typeof allServices[0]>();
        filteredServices
            .filter(s => s.status === 'Concluído')
            .forEach(s => {
                const existing = latestCompletedPerClient.get(s.clientId);
                if (!existing || parseLocalDate(s.date) > parseLocalDate(existing.date)) {
                    latestCompletedPerClient.set(s.clientId, s);
                }
            });

        const scheduledServices = filteredServices.filter(s => s.status === 'Agendado' || (includeIgnored && s.status === 'Cancelado'));

        // Serviços sem próxima manutenção são gravados com nextServiceDate == date;
        // esses não devem virar lembrete.
        const reminderItems = Array.from(latestCompletedPerClient.values())
            .filter(s => s.nextServiceDate && parseLocalDate(s.nextServiceDate) > parseLocalDate(s.date))
            .map(s => {
            const nextDate = parseLocalDate(s.nextServiceDate);
            nextDate.setHours(0, 0, 0, 0);
            const diffTime = nextDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return {
                ...s,
                displayDate: s.nextServiceDate,
                daysRemaining: diffDays,
                isReminder: true
            };
        });

        const scheduled = scheduledServices.map(s => {
            const serviceDate = parseLocalDate(s.date);
            serviceDate.setHours(0, 0, 0, 0);
            const diffTime = serviceDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return {
                ...s,
                displayDate: s.date,
                daysRemaining: diffDays,
                isReminder: false
            };
        });

        return [...reminderItems, ...scheduled]
            .map(item => ({
                ...item,
                clientName: clientMap.get(item.clientId)?.name || 'Desconhecido',
                clientPhone: clientMap.get(item.clientId)?.phone || '',
            }))
            .filter(r => includeIgnored ? true : r.daysRemaining >= -7)
            .sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [includeIgnored]);
}

export function useDashboardStats() {
    return useLiveQuery(async () => {
        const now = new Date();
        const currentYearMonth = format(now, 'yyyy-MM');
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastYearMonth = format(lastMonthDate, 'yyyy-MM');

        const [allServices, allClients, allHelperEntries] = await Promise.all([
            db.services.toArray(),
            db.clients.toArray(),
            db.helperEntries.toArray()
        ]);

        const clientMap = new Map(allClients.map(c => [c.id!, c.name]));

        // Filtra serviços válidos (não cancelados) para o faturamento real do mês
        const validServices = allServices.filter(s => s.status !== 'Cancelado');

        const currentRevenue = validServices
            .filter(s => getYearMonth(s.date) === currentYearMonth)
            .reduce((acc, s) => acc + getServicePrice(s), 0);

        const lastMonthRevenue = validServices
            .filter(s => getYearMonth(s.date) === lastYearMonth)
            .reduce((acc, s) => acc + getServicePrice(s), 0);

        const currentHelperCost = allHelperEntries
            .filter(e => e.type === 'work' && getYearMonth(e.date) === currentYearMonth)
            .reduce((acc, e) => acc + parseMonetaryValue(e.amount), 0);

        const lastMonthHelperCost = allHelperEntries
            .filter(e => e.type === 'work' && getYearMonth(e.date) === lastYearMonth)
            .reduce((acc, e) => acc + parseMonetaryValue(e.amount), 0);

        const recentServices = allServices
            .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())
            .slice(0, 5)
            .map(s => ({
                ...s,
                price: getServicePrice(s),
                clientName: clientMap.get(s.clientId) || 'Desconhecido'
            }));

        const breakdown: Record<string, number> = {};
        validServices.forEach(s => {
            const type = s.type || (s.items && s.items[0]?.type) || 'Outro';
            breakdown[type] = (breakdown[type] || 0) + 1;
        });

        const serviceTypeBreakdown = Object.entries(breakdown)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        return {
            clientsCount: allClients.length,
            servicesCount: validServices.length,
            currentRevenue,
            lastMonthRevenue,
            currentHelperCost,
            lastMonthHelperCost,
            recentServices,
            serviceTypeBreakdown,
        };
    }, []);
}

export function useDetailedServices() {
    return useLiveQuery(async () => {
        // Busca serviços e clientes em paralelo — mais rápido que sequencial
        const [services, clients] = await Promise.all([
            db.services.orderBy('date').reverse().toArray(),
            db.clients.toArray()
        ]);
        const clientMap = new Map(clients.map(c => [c.id!, c]));
        return services.map(s => ({
            ...s,
            clientName: clientMap.get(s.clientId)?.name || 'Desconhecido',
            clientPhone: clientMap.get(s.clientId)?.phone || '',
        }));
    });
}

export const DEFAULT_COMPANY_NAME = 'FrioTech Soluções';

/** Nome da empresa configurado em Configurações (usado em recibos, mensagens etc.). */
export function useCompanyName(): string {
    const settings = useSettings();
    return settings?.name?.trim() || DEFAULT_COMPANY_NAME;
}

export function useSettings() {
    return useLiveQuery(async () => {
        const settings = await db.settings.toArray();
        if (settings && settings.length > 0) {
            return settings[0];
        } else {
            // Default settings
            return {
                name: DEFAULT_COMPANY_NAME,
                phone: '',
                pixKey: '',
                address: '',
                autoBackupEnabled: false,
                darkMode: false
            } as CompanySettings;
        }
    });
}
