import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CompanySettings } from '../types';

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
            return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

export function useReminders() {
    return useLiveQuery(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [allServices, clients] = await Promise.all([
            db.services.toArray(),
            db.clients.toArray()
        ]);

        const clientMap = new Map(clients.map(c => [c.id!, c]));

        // Latest completed service per client
        const latestCompletedPerClient = new Map<string, typeof allServices[0]>();
        allServices
            .filter(s => s.status === 'Concluído')
            .forEach(s => {
                const existing = latestCompletedPerClient.get(s.clientId);
                if (!existing || new Date(s.date) > new Date(existing.date)) {
                    latestCompletedPerClient.set(s.clientId, s);
                }
            });

        const scheduledServices = allServices.filter(s => s.status === 'Agendado');

        const reminderItems = Array.from(latestCompletedPerClient.values()).map(s => {
            const nextDate = new Date(s.nextServiceDate);
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
            const serviceDate = new Date(s.date);
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
            .filter(r => r.daysRemaining >= -7)
            .sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, []);
}

export function useDashboardStats() {
    return useLiveQuery(async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        const [allServices, allClients, allHelperEntries] = await Promise.all([
            db.services.toArray(),
            db.clients.toArray(),
            db.helperEntries.toArray()
        ]);

        const clientMap = new Map(allClients.map(c => [c.id!, c.name]));

        const currentRevenue = allServices
            .filter(s => new Date(s.date) >= startOfMonth)
            .reduce((acc, s) => acc + s.price, 0);

        const lastMonthRevenue = allServices
            .filter(s => {
                const d = new Date(s.date);
                return d >= startOfLastMonth && d <= endOfLastMonth;
            })
            .reduce((acc, s) => acc + s.price, 0);

        const currentHelperCost = allHelperEntries
            .filter(e => e.type === 'work' && new Date(e.date) >= startOfMonth)
            .reduce((acc, e) => acc + e.amount, 0);

        const lastMonthHelperCost = allHelperEntries
            .filter(e => {
                const d = new Date(e.date);
                return e.type === 'work' && d >= startOfLastMonth && d <= endOfLastMonth;
            })
            .reduce((acc, e) => acc + e.amount, 0);

        const recentServices = allServices
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5)
            .map(s => ({
                ...s,
                clientName: clientMap.get(s.clientId) || 'Desconhecido'
            }));

        const breakdown: Record<string, number> = {};
        allServices.forEach(s => {
            const type = s.type || (s.items && s.items[0]?.type) || 'Outro';
            breakdown[type] = (breakdown[type] || 0) + 1;
        });

        const serviceTypeBreakdown = Object.entries(breakdown)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        return {
            clientsCount: allClients.length,
            servicesCount: allServices.length,
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

export function useSettings() {
    return useLiveQuery(async () => {
        const settings = await db.settings.toArray();
        if (settings && settings.length > 0) {
            return settings[0];
        } else {
            // Default settings
            return {
                name: 'FrioTech Soluções',
                phone: '',
                pixKey: '',
                address: '',
                autoBackupEnabled: false,
                darkMode: false
            } as CompanySettings;
        }
    });
}
