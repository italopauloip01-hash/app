import { supabase } from '../lib/supabaseClient';
import { db } from '../db';
import type { Client, Service, Helper, HelperEntry, ServiceTemplate, CompanySettings, Estimate } from '../types';
import { generateUUID } from '../utils/uuid';

// ============================================
// Utility: camelCase -> snake_case for Supabase
// ============================================
function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}

function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
}

// ============================================
// Auth Helper
// ============================================
export async function getUserId(): Promise<string> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
        throw new Error("Usuário não Autenticado");
    }
    return userData.user.id;
}

// ============================================
// Clients (Instant local save + Background Cloud Sync)
// ============================================
export async function addClient(client: Omit<Client, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...client, id } as Client;
    await db.clients.put(newRecord);

    // Background sync to Supabase
    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;
            await supabase.from('clients').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync queued/offline for client:', err);
        }
    })();

    return id;
}

export async function updateClient(id: string, changes: Partial<Client>) {
    await db.clients.update(id, changes);

    // Background sync to Supabase
    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.clients.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;
                await supabase.from('clients').update(snaked).eq('id', id);
            }
        } catch (err) {
            console.warn('Background sync update failed for client:', err);
        }
    })();
}

export async function deleteClient(id: string) {
    await db.clients.delete(id);

    (async () => {
        try {
            await supabase.from('clients').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for client:', err);
        }
    })();
}

// ============================================
// Services (Instant local save + Background Cloud Sync)
// ============================================
export async function addService(service: Omit<Service, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...service, id } as Service;
    await db.services.put(newRecord);

    // Background sync to Supabase
    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;

            // Ensure date fields are ISO strings
            if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
            if (snaked.next_service_date instanceof Date) snaked.next_service_date = (snaked.next_service_date as Date).toISOString();

            await supabase.from('services').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync queued/offline for service:', err);
        }
    })();

    return id;
}

export async function updateService(id: string, changes: Partial<Service>) {
    await db.services.update(id, changes);

    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.services.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;

                if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
                if (snaked.next_service_date instanceof Date) snaked.next_service_date = (snaked.next_service_date as Date).toISOString();
                await supabase.from('services').update(snaked).eq('id', id);
            }
        } catch (err) {
            console.warn('Background sync update failed for service:', err);
        }
    })();
}

export async function deleteService(id: string) {
    await db.services.delete(id);

    (async () => {
        try {
            await supabase.from('services').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for service:', err);
        }
    })();
}

// ============================================
// Helpers
// ============================================
export async function addHelper(helper: Omit<Helper, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...helper, id } as Helper;
    await db.helpers.put(newRecord);

    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;
            await supabase.from('helpers').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync failed for helper:', err);
        }
    })();

    return id;
}

export async function updateHelper(id: string, changes: Partial<Helper>) {
    await db.helpers.update(id, changes);

    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.helpers.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;
                await supabase.from('helpers').update(snaked).eq('id', id);
            }
        } catch (err) {
            console.warn('Background sync update failed for helper:', err);
        }
    })();
}

export async function deleteHelper(id: string) {
    await db.helpers.delete(id);

    (async () => {
        try {
            await supabase.from('helpers').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for helper:', err);
        }
    })();
}

// ============================================
// Helper Entries
// ============================================
export async function addHelperEntry(entry: Omit<HelperEntry, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...entry, id } as HelperEntry;
    await db.helperEntries.put(newRecord);

    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;

            if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
            await supabase.from('helper_entries').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync failed for helper entry:', err);
        }
    })();

    return id;
}

export async function updateHelperEntry(id: string, entry: Partial<HelperEntry>): Promise<void> {
    await db.helperEntries.update(id, entry);

    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.helperEntries.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;

                if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
                await supabase.from('helper_entries').update(snaked).match({ id });
            }
        } catch (err) {
            console.warn('Background sync update failed for helper entry:', err);
        }
    })();
}

export async function deleteHelperEntry(id: string) {
    await db.helperEntries.delete(id);

    (async () => {
        try {
            await supabase.from('helper_entries').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for helper entry:', err);
        }
    })();
}

// ============================================
// Service Templates
// ============================================
export async function addServiceTemplate(template: Omit<ServiceTemplate, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...template, id } as ServiceTemplate;
    await db.serviceTemplates.put(newRecord);

    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;
            await supabase.from('service_templates').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync failed for template:', err);
        }
    })();

    return id;
}

export async function updateServiceTemplate(id: string, changes: Partial<ServiceTemplate>) {
    await db.serviceTemplates.update(id, changes);

    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.serviceTemplates.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;
                await supabase.from('service_templates').update(snaked).eq('id', id);
            }
        } catch (err) {
            console.warn('Background sync update failed for template:', err);
        }
    })();
}

export async function deleteServiceTemplate(id: string) {
    await db.serviceTemplates.delete(id);

    (async () => {
        try {
            await supabase.from('service_templates').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for template:', err);
        }
    })();
}

// ============================================
// Estimates
// ============================================
export async function addEstimate(estimate: Omit<Estimate, 'id'>): Promise<string> {
    const id = generateUUID();
    const newRecord = { ...estimate, id } as Estimate;
    await db.estimates.put(newRecord);

    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(newRecord as unknown as Record<string, unknown>);
            snaked.user_id = userId;

            if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
            await supabase.from('estimates').upsert(snaked, { onConflict: 'id' });
        } catch (err) {
            console.warn('Background sync failed for estimate:', err);
        }
    })();

    return id;
}

export async function updateEstimate(id: string, changes: Partial<Estimate>) {
    await db.estimates.update(id, changes);

    (async () => {
        try {
            const userId = await getUserId();
            const updated = await db.estimates.get(id);
            if (updated) {
                const snaked = toSnake(updated as unknown as Record<string, unknown>);
                snaked.user_id = userId;

                if (snaked.date instanceof Date) snaked.date = (snaked.date as Date).toISOString();
                await supabase.from('estimates').update(snaked).eq('id', id);
            }
        } catch (err) {
            console.warn('Background sync update failed for estimate:', err);
        }
    })();
}

export async function deleteEstimate(id: string) {
    await db.estimates.delete(id);

    (async () => {
        try {
            await supabase.from('estimates').delete().eq('id', id);
        } catch (err) {
            console.warn('Background delete failed for estimate:', err);
        }
    })();
}

// ============================================
// Settings
// ============================================
export async function saveSettings(settings: CompanySettings) {
    if (!settings.id) {
        settings.id = generateUUID();
    }

    await db.settings.clear();
    await db.settings.put(settings);

    (async () => {
        try {
            const userId = await getUserId();
            const snaked = toSnake(settings as unknown as Record<string, unknown>);
            snaked.user_id = userId;

            const { data, error } = await supabase
                .from('settings')
                .upsert(snaked, { onConflict: 'user_id' })
                .select()
                .single();

            if (!error && data) {
                const updated = toCamel(data as Record<string, unknown>) as unknown as CompanySettings;
                await db.settings.put(updated);
            }
        } catch (err) {
            console.warn('Background sync failed for settings:', err);
        }
    })();

    return settings;
}

// ============================================
// Get single client from Supabase
// ============================================
export async function getClient(id: string): Promise<Client | undefined> {
    try {
        const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
        if (error) throw error;
        return toCamel(data as Record<string, unknown>) as unknown as Client;
    } catch {
        return await db.clients.get(id);
    }
}

// ============================================
// Sync State Management
// ============================================
type SyncListener = (isSyncing: boolean) => void;
const syncListeners: Set<SyncListener> = new Set();
let _isSyncing = false;

export function onSyncStateChange(listener: SyncListener) {
    syncListeners.add(listener);
    listener(_isSyncing); // Immediate initial state
    return () => syncListeners.delete(listener);
}

function setSyncing(state: boolean) {
    _isSyncing = state;
    syncListeners.forEach(l => l(state));
}

// ============================================
// Master Sync Engine
// ============================================
export async function syncDatabase() {
    if (_isSyncing) return; // Prevent overlapping syncs

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log('App is offline, skipping sync.');
        return;
    }

    let userId: string;
    try {
        userId = await getUserId();
    } catch (authError) {
        console.warn('Sync paused: Usuário não autenticado.');
        return;
    }

    try {
        setSyncing(true);
        console.log('Starting bidirectional sync...');

        const tables = [
            { name: 'clients', dexie: db.clients },
            { name: 'services', dexie: db.services },
            { name: 'helpers', dexie: db.helpers },
            { name: 'helper_entries', dexie: db.helperEntries },
            { name: 'service_templates', dexie: db.serviceTemplates },
            { name: 'settings', dexie: db.settings },
            { name: 'estimates', dexie: db.estimates },
        ];

        for (const table of tables) {
            // 1. Get all local records
            const localRecords = await table.dexie.toArray();

            // 2. Format dates, snake_case, and inject user_id
            const pushData = localRecords.map(record => {
                const snaked = toSnake(record as unknown as Record<string, unknown>);
                snaked.user_id = userId;

                for (const key of Object.keys(snaked)) {
                    if (snaked[key] instanceof Date) {
                        snaked[key] = (snaked[key] as Date).toISOString();
                    }
                }
                return snaked;
            });

            // 3. Upsert to Supabase
            let pushFailed = false;
            if (pushData.length > 0) {
                const upsertOptions = table.name === 'settings' ? { onConflict: 'user_id' } : { onConflict: 'id' };
                //@ts-ignore
                const { error: pushError } = await supabase.from(table.name).upsert(pushData, upsertOptions);
                if (pushError) {
                    console.error(`Failed to push ${table.name} to Supabase:`, pushError);
                    pushFailed = true;
                }
            }

            // 4. Protect local data if push failed
            if (pushFailed) {
                console.warn(`Shielding local data for ${table.name}: Push failed. Skipping local overwrite prevent data loss.`);
                continue;
            }

            // 5. Fetch the absolute truth from Supabase
            const { data: remoteData, error: pullError } = await supabase.from(table.name).select('*');
            if (pullError) {
                console.error(`Failed to pull ${table.name} from Supabase:`, pullError);
                continue;
            }

            // 6. Update local Dexie smoothly without clearing (prevents screen flickering)
            if (remoteData && remoteData.length > 0) {
                const pullRecords = remoteData.map(r => toCamel(r as Record<string, unknown>));
                await (table.dexie as any).bulkPut(pullRecords as any[]);
            }
        }

        console.log('Sync complete.');
    } catch (error) {
        console.error('Master Sync failed:', error);
    } finally {
        setSyncing(false);
    }
}

// ============================================
// Realtime Sync Engine (Supabase WebSockets)
// ============================================
let realtimeSubscription: any = null;

export async function subscribeToRealtime(userId: string) {
    if (realtimeSubscription) return; // Prevent duplicate subscriptions

    console.log('Activating Supabase Realtime Sync...');

    realtimeSubscription = supabase
        .channel('public:all_tables')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            async (payload) => {
                const { eventType, new: newRecord, old: oldRecord, table } = payload;
                if (!newRecord && !oldRecord) return; // Ignore empty payloads

                // Only process records belonging to the current user (if applicable)
                if (newRecord && 'user_id' in newRecord && newRecord.user_id !== userId) return;

                console.log(`Realtime Event: ${eventType} on ${table}`, payload);

                const tablesMap: Record<string, any> = {
                    'clients': db.clients,
                    'services': db.services,
                    'helpers': db.helpers,
                    'helper_entries': db.helperEntries,
                    'service_templates': db.serviceTemplates,
                    'settings': db.settings,
                    'estimates': db.estimates
                };

                const dexieTable = tablesMap[table];
                if (!dexieTable) return; // Ignore unknown tables

                try {
                    switch (eventType) {
                        case 'INSERT':
                        case 'UPDATE':
                            if (newRecord) {
                                const camelRecord = toCamel(newRecord as Record<string, unknown>);
                                await dexieTable.put(camelRecord);
                            }
                            break;
                        case 'DELETE':
                            if (oldRecord && oldRecord.id) {
                                await dexieTable.delete(oldRecord.id);
                            }
                            break;
                    }
                } catch (err) {
                    console.error(`Error processing realtime event for ${table}:`, err);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Supabase Realtime Connection Established.');
            } else if (status === 'CLOSED') {
                console.log('Supabase Realtime Connection Closed. Tentando reconectar em 5 segundos...');
                if (realtimeSubscription) {
                    supabase.removeChannel(realtimeSubscription);
                    realtimeSubscription = null;
                }
                setTimeout(() => {
                    subscribeToRealtime(userId);
                }, 5000);
            } else if (status === 'CHANNEL_ERROR') {
                console.error('Supabase Realtime Channel Error. Tentando reconectar em 5 segundos...');
                if (realtimeSubscription) {
                    supabase.removeChannel(realtimeSubscription);
                    realtimeSubscription = null;
                }
                setTimeout(() => {
                    subscribeToRealtime(userId);
                }, 5000);
            }
        });
}

export function unsubscribeFromRealtime() {
    if (realtimeSubscription) {
        supabase.removeChannel(realtimeSubscription);
        realtimeSubscription = null;
        console.log('Deactivated Supabase Realtime Sync.');
    }
}
