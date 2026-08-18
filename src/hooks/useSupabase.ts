import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../db';
import type { Client, Service, Helper, HelperEntry, ServiceTemplate, CompanySettings } from '../types';

// ============================================
// Utility: snake_case <-> camelCase conversion
// ============================================
function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
}

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}

// ============================================
// Generic Supabase CRUD Hook
// ============================================
export function useSupabaseTable<T extends { id?: string }>(
    tableName: string,
    dexieTable: import('dexie').Table<T>,
    orderBy?: string
) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            let query = supabase.from(tableName).select('*');
            if (orderBy) {
                query = query.order(orderBy, { ascending: false });
            }
            const { data: rows, error } = await query;

            if (error) throw error;

            const camelRows = (rows || []).map(r => toCamel(r as Record<string, unknown>) as unknown as T);
            setData(camelRows);

            // Sync to local cache
            await dexieTable.clear();
            if (camelRows.length > 0) {
                await dexieTable.bulkPut(camelRows);
            }
        } catch {
            // Offline fallback: use Dexie
            const localData = await dexieTable.toArray();
            setData(localData);
        } finally {
            setLoading(false);
        }
    }, [tableName, dexieTable, orderBy]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const add = async (item: Omit<T, 'id'>): Promise<T | null> => {
        try {
            const snaked = toSnake(item as Record<string, unknown>);
            const { data: row, error } = await supabase.from(tableName).insert(snaked).select().single();
            if (error) throw error;
            const camelRow = toCamel(row as Record<string, unknown>) as unknown as T;
            await dexieTable.put(camelRow);
            await fetchData();
            return camelRow;
        } catch {
            // Offline: save locally
            const id = await dexieTable.add(item as T);
            await fetchData();
            return { ...item, id } as T;
        }
    };

    const update = async (id: number, changes: Partial<T>) => {
        try {
            const snaked = toSnake(changes as Record<string, unknown>);
            const { error } = await supabase.from(tableName).update(snaked).eq('id', id);
            if (error) throw error;
            await dexieTable.update(id, changes as any);
            await fetchData();
        } catch {
            await dexieTable.update(id, changes as any);
            await fetchData();
        }
    };

    const remove = async (id: number) => {
        try {
            const { error } = await supabase.from(tableName).delete().eq('id', id);
            if (error) throw error;
            await dexieTable.delete(id);
            await fetchData();
        } catch {
            await dexieTable.delete(id);
            await fetchData();
        }
    };

    return { data, loading, add, update, remove, refetch: fetchData };
}

// ============================================
// Specific Table Hooks
// ============================================
export function useSupabaseClients() {
    return useSupabaseTable<Client>('clients', db.clients, 'name');
}

export function useSupabaseHelpers() {
    return useSupabaseTable<Helper>('helpers', db.helpers, 'name');
}

export function useSupabaseHelperEntries() {
    return useSupabaseTable<HelperEntry>('helper_entries', db.helperEntries, 'date');
}

export function useSupabaseServices() {
    return useSupabaseTable<Service>('services', db.services, 'date');
}

export function useSupabaseServiceTemplates() {
    return useSupabaseTable<ServiceTemplate>('service_templates', db.serviceTemplates, 'name');
}

// ============================================
// Settings Hook (singleton)
// ============================================
export function useSupabaseSettings() {
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        try {
            const { data: rows, error } = await supabase.from('settings').select('*').limit(1);
            if (error) throw error;
            if (rows && rows.length > 0) {
                const camelRow = toCamel(rows[0] as Record<string, unknown>) as unknown as CompanySettings;
                setSettings(camelRow);
                // Cache locally
                await db.settings.clear();
                await db.settings.put(camelRow);
            } else {
                // No settings yet, create default
                const defaults: CompanySettings = {
                    name: 'FrioTech Soluções',
                    phone: '',
                    pixKey: '',
                    address: '',
                };
                setSettings(defaults);
            }
        } catch {
            // Offline fallback
            const local = await db.settings.toArray();
            setSettings(local[0] || { name: 'FrioTech Soluções', phone: '', pixKey: '', address: '' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const saveSettings = async (updated: CompanySettings) => {
        try {
            const snaked = toSnake(updated as unknown as Record<string, unknown>);
            if (updated.id) {
                await supabase.from('settings').update(snaked).eq('id', updated.id);
            } else {
                const { data: row } = await supabase.from('settings').insert(snaked).select().single();
                if (row) {
                    updated = toCamel(row as Record<string, unknown>) as unknown as CompanySettings;
                }
            }
        } catch {
            // Save locally if offline
        }
        await db.settings.clear();
        await db.settings.put(updated);
        setSettings(updated);
    };

    return { settings, loading, saveSettings, refetch: fetchSettings };
}
