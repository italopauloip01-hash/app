import type { Table } from 'dexie';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { db, SYNCED_TABLES, type LocalTableName, type OutboxEntry } from '../db';
import type { Client, Service, Helper, HelperEntry, ServiceTemplate, CompanySettings, Estimate } from '../types';
import { generateUUID } from '../utils/uuid';
import { normalizeRecord } from '../utils/normalize';

// ============================================
// Arquitetura de sincronização
// --------------------------------------------
// 1. Toda escrita é gravada no Dexie e registrada na fila `outbox`, na mesma transação.
// 2. `flushOutbox` envia ao Supabase só o que está na fila (upserts e exclusões).
//    Se estiver offline ou falhar, a fila fica guardada e é reenviada depois.
// 3. `syncDatabase` esvazia a fila e depois baixa tudo do Supabase, removendo localmente
//    o que foi apagado em outro aparelho (desde que não tenha pendência local).
// ============================================

type AnyRecord = Record<string, unknown>;

const LOCAL_USER_KEY = 'airtech:lastUserId';
const PUSH_CHUNK_SIZE = 25; // registros com fotos em base64 podem ser grandes
const PULL_PAGE_SIZE = 1000; // limite padrão do PostgREST por requisição

function dexieTable(name: LocalTableName): Table<AnyRecord, string> {
    return db.table(name) as Table<AnyRecord, string>;
}

function localName(remote: string): LocalTableName | undefined {
    return SYNCED_TABLES.find(t => t.remote === remote)?.local;
}

// ============================================
// Utility: camelCase <-> snake_case for Supabase
// ============================================
function toSnake(obj: AnyRecord): AnyRecord {
    const result: AnyRecord = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}

function toCamel(obj: AnyRecord): AnyRecord {
    const result: AnyRecord = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
}

function toRemoteRow(record: AnyRecord, userId: string): AnyRecord {
    const row = toSnake(record);
    row.user_id = userId;
    for (const key of Object.keys(row)) {
        if (row[key] instanceof Date) row[key] = (row[key] as Date).toISOString();
    }
    return row;
}

function fromRemoteRow(row: AnyRecord): AnyRecord {
    return normalizeRecord(toCamel(row));
}

// ============================================
// Auth Helper
// ============================================
export async function getUserId(): Promise<string> {
    // getSession lê a sessão local (funciona offline); getUser faria uma chamada de rede.
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new Error('Usuário não Autenticado');
    return id;
}

/**
 * Garante que os dados locais pertencem ao usuário logado. Se outra conta logar neste
 * aparelho, apaga os dados locais da conta anterior antes de sincronizar — senão eles
 * seriam enviados para a conta nova.
 */
export async function ensureLocalDataOwner(userId: string) {
    let previous: string | null = null;
    try { previous = localStorage.getItem(LOCAL_USER_KEY); } catch { /* storage indisponível */ }

    if (previous && previous !== userId) {
        console.warn('Outra conta logou neste aparelho. Limpando dados locais da conta anterior.');
        await clearLocalData();
    }
    try { localStorage.setItem(LOCAL_USER_KEY, userId); } catch { /* storage indisponível */ }
}

export async function clearLocalData() {
    await db.transaction('rw', [...SYNCED_TABLES.map(t => db.table(t.local)), db.outbox], async () => {
        for (const t of SYNCED_TABLES) await db.table(t.local).clear();
        await db.outbox.clear();
    });
}

/** Quantidade de alterações ainda não enviadas ao Supabase. */
export async function getPendingChangesCount(): Promise<number> {
    return db.outbox.count();
}

// ============================================
// Escrita local + fila
// ============================================
function outboxEntry(table: LocalTableName, recordId: string, op: OutboxEntry['op']): OutboxEntry {
    return { key: `${table}:${recordId}`, table, recordId, op, ts: Date.now() };
}

async function localPut(table: LocalTableName, record: AnyRecord & { id: string }) {
    await db.transaction('rw', dexieTable(table), db.outbox, async () => {
        await dexieTable(table).put(record);
        await db.outbox.put(outboxEntry(table, record.id, 'upsert'));
    });
    scheduleFlush();
}

async function localUpdate(table: LocalTableName, id: string, changes: AnyRecord) {
    await db.transaction('rw', dexieTable(table), db.outbox, async () => {
        await dexieTable(table).update(id, changes);
        await db.outbox.put(outboxEntry(table, id, 'upsert'));
    });
    scheduleFlush();
}

async function localDelete(table: LocalTableName, id: string) {
    await db.transaction('rw', dexieTable(table), db.outbox, async () => {
        await dexieTable(table).delete(id);
        await db.outbox.put(outboxEntry(table, id, 'delete'));
    });
    scheduleFlush();
}

/** Enfileira registros já gravados localmente (ex.: após restaurar backup). */
export async function enqueueUpserts(table: LocalTableName, ids: string[]) {
    if (ids.length === 0) return;
    await db.outbox.bulkPut(ids.map(id => outboxEntry(table, id, 'upsert')));
    scheduleFlush();
}

async function addRecord<T>(table: LocalTableName, data: Omit<T, 'id'>): Promise<string> {
    const id = generateUUID();
    await localPut(table, { ...(data as AnyRecord), id });
    return id;
}

// ============================================
// API pública (mesma assinatura de antes)
// ============================================
export const addClient = (client: Omit<Client, 'id'>) => addRecord<Client>('clients', client);
export const updateClient = (id: string, changes: Partial<Client>) => localUpdate('clients', id, changes);
export const deleteClient = (id: string) => localDelete('clients', id);

export const addService = (service: Omit<Service, 'id'>) => addRecord<Service>('services', service);
export const updateService = (id: string, changes: Partial<Service>) => localUpdate('services', id, changes);
export const deleteService = (id: string) => localDelete('services', id);

export const addHelper = (helper: Omit<Helper, 'id'>) => addRecord<Helper>('helpers', helper);
export const updateHelper = (id: string, changes: Partial<Helper>) => localUpdate('helpers', id, changes);
export const deleteHelper = (id: string) => localDelete('helpers', id);

export const addHelperEntry = (entry: Omit<HelperEntry, 'id'>) => addRecord<HelperEntry>('helperEntries', entry);
export const updateHelperEntry = (id: string, changes: Partial<HelperEntry>) => localUpdate('helperEntries', id, changes);
export const deleteHelperEntry = (id: string) => localDelete('helperEntries', id);

export const addServiceTemplate = (t: Omit<ServiceTemplate, 'id'>) => addRecord<ServiceTemplate>('serviceTemplates', t);
export const updateServiceTemplate = (id: string, changes: Partial<ServiceTemplate>) => localUpdate('serviceTemplates', id, changes);
export const deleteServiceTemplate = (id: string) => localDelete('serviceTemplates', id);

export const addEstimate = (estimate: Omit<Estimate, 'id'>) => addRecord<Estimate>('estimates', estimate);
export const updateEstimate = (id: string, changes: Partial<Estimate>) => localUpdate('estimates', id, changes);
export const deleteEstimate = (id: string) => localDelete('estimates', id);

export async function saveSettings(settings: CompanySettings) {
    const record = { ...settings, id: settings.id || generateUUID() };
    await db.transaction('rw', db.settings, db.outbox, async () => {
        // Só existe uma linha de configurações por usuário
        await db.settings.clear();
        await db.settings.put(record);
        await db.outbox.put(outboxEntry('settings', record.id, 'upsert'));
    });
    scheduleFlush();
    return record;
}

export async function getClient(id: string): Promise<Client | undefined> {
    return db.clients.get(id);
}

// ============================================
// Envio da fila (outbox) para o Supabase
// ============================================
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    // Pequeno atraso agrupa várias escritas seguidas numa única requisição
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushOutbox().catch(err => console.warn('Envio de pendências falhou:', err));
    }, 800);
}

/** Remove da fila só as entradas que não mudaram desde que foram lidas. */
async function acknowledge(entries: OutboxEntry[]) {
    await db.transaction('rw', db.outbox, async () => {
        for (const e of entries) {
            const current = await db.outbox.get(e.key);
            if (current && current.ts === e.ts && current.op === e.op) await db.outbox.delete(e.key);
        }
    });
}

export function flushOutbox(): Promise<void> {
    // Evita dois envios simultâneos da mesma fila
    if (!flushing) {
        flushing = doFlush().finally(() => { flushing = null; });
    }
    return flushing;
}

async function doFlush() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    let userId: string;
    try {
        userId = await getUserId();
    } catch {
        return;
    }

    const entries = await db.outbox.toArray();
    if (entries.length === 0) return;

    for (const { local, remote } of SYNCED_TABLES) {
        const tableEntries = entries.filter(e => e.table === local);
        if (tableEntries.length === 0) continue;

        // Exclusões
        const deletes = tableEntries.filter(e => e.op === 'delete');
        if (deletes.length > 0) {
            const { error } = await supabase.from(remote).delete().in('id', deletes.map(e => e.recordId));
            if (error) console.error(`Falha ao excluir em ${remote}:`, error);
            else await acknowledge(deletes);
        }

        // Inclusões/alterações
        const upserts = tableEntries.filter(e => e.op === 'upsert');
        for (let i = 0; i < upserts.length; i += PUSH_CHUNK_SIZE) {
            const chunk = upserts.slice(i, i + PUSH_CHUNK_SIZE);
            const records = await dexieTable(local).bulkGet(chunk.map(e => e.recordId));

            const rows: AnyRecord[] = [];
            const missing: OutboxEntry[] = [];
            chunk.forEach((entry, idx) => {
                const rec = records[idx];
                if (rec) rows.push(toRemoteRow(rec, userId));
                else missing.push(entry); // apagado localmente depois; a exclusão tem entrada própria
            });
            if (missing.length) await acknowledge(missing);
            if (rows.length === 0) continue;

            const onConflict = local === 'settings' ? 'user_id' : 'id';
            const { error } = await supabase.from(remote).upsert(rows, { onConflict });
            if (error) {
                console.error(`Falha ao enviar ${remote}:`, error);
                break; // mantém o restante na fila para a próxima tentativa
            }
            await acknowledge(chunk.filter(e => !missing.includes(e)));
        }
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

async function fetchAllRows(remote: string): Promise<AnyRecord[] | null> {
    const all: AnyRecord[] = [];
    for (let from = 0; ; from += PULL_PAGE_SIZE) {
        const { data, error } = await supabase
            .from(remote)
            .select('*')
            .order('id')
            .range(from, from + PULL_PAGE_SIZE - 1);
        if (error) {
            console.error(`Falha ao baixar ${remote}:`, error);
            return null;
        }
        all.push(...(data as AnyRecord[]));
        if (!data || data.length < PULL_PAGE_SIZE) return all;
    }
}

// ============================================
// Master Sync Engine
// ============================================
export interface SyncResult {
    ok: boolean;
    pending: number; // alterações locais que ainda não subiram
    reason?: 'offline' | 'unauthenticated' | 'busy' | 'error';
}

export async function syncDatabase(): Promise<SyncResult> {
    const pendingNow = async () => db.outbox.count();

    if (_isSyncing) return { ok: false, pending: await pendingNow(), reason: 'busy' };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { ok: false, pending: await pendingNow(), reason: 'offline' };
    }

    try {
        await getUserId();
    } catch {
        return { ok: false, pending: await pendingNow(), reason: 'unauthenticated' };
    }

    let ok = true;
    try {
        setSyncing(true);

        // 1. Envia pendências locais
        await flushOutbox();

        // 2. Baixa o estado da nuvem
        for (const { local, remote } of SYNCED_TABLES) {
            const remoteRows = await fetchAllRows(remote);
            if (remoteRows === null) {
                ok = false;
                continue;
            }

            const pending = new Set(
                (await db.outbox.where('table').equals(local).toArray()).map(e => e.recordId)
            );
            // Não sobrescreve registros com alteração local ainda não enviada
            const incoming = remoteRows.map(fromRemoteRow).filter(r => !pending.has(String(r.id)));

            if (local === 'settings') {
                if (incoming.length > 0 && pending.size === 0) {
                    await db.transaction('rw', db.settings, async () => {
                        await db.settings.clear();
                        await db.settings.put(incoming[0] as unknown as CompanySettings);
                    });
                }
                continue;
            }

            await db.transaction('rw', dexieTable(local), async () => {
                if (incoming.length > 0) await dexieTable(local).bulkPut(incoming);

                // Remove o que foi apagado em outro aparelho. Se a nuvem voltou vazia,
                // não apaga nada (pode ser falha de sessão e não uma exclusão real).
                if (remoteRows.length > 0) {
                    const remoteIds = new Set(remoteRows.map(r => String(r.id)));
                    const localIds = (await dexieTable(local).toCollection().primaryKeys()).map(String);
                    const gone = localIds.filter(id => !remoteIds.has(id) && !pending.has(id));
                    if (gone.length > 0) await dexieTable(local).bulkDelete(gone);
                }
            });
        }

        console.log('Sync complete.');
    } catch (error) {
        console.error('Master Sync failed:', error);
        ok = false;
    } finally {
        setSyncing(false);
    }

    const pending = await pendingNow();
    return { ok: ok && pending === 0, pending, reason: ok && pending === 0 ? undefined : 'error' };
}

// ============================================
// Realtime Sync Engine (Supabase WebSockets)
// ============================================
let realtimeChannel: RealtimeChannel | null = null;
let realtimeUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeToRealtime(userId: string) {
    if (realtimeChannel && realtimeUserId === userId) return; // já inscrito
    if (realtimeChannel) unsubscribeFromRealtime();

    realtimeUserId = userId;
    const channel = supabase
        .channel('public:all_tables')
        .on('postgres_changes', { event: '*', schema: 'public' }, async (payload) => {
            const { eventType, new: newRecord, old: oldRecord, table } = payload;
            const local = localName(table);
            if (!local) return;

            const newRow = newRecord as AnyRecord | null;
            if (newRow && 'user_id' in newRow && newRow.user_id !== userId) return;

            try {
                if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
                    // Ignora eco de alteração local ainda pendente
                    if (await db.outbox.get(`${local}:${newRow.id}`)) return;
                    if (local === 'settings') {
                        await db.transaction('rw', db.settings, async () => {
                            await db.settings.clear();
                            await db.settings.put(fromRemoteRow(newRow) as unknown as CompanySettings);
                        });
                    } else {
                        await dexieTable(local).put(fromRemoteRow(newRow));
                    }
                } else if (eventType === 'DELETE') {
                    const oldRow = oldRecord as AnyRecord | null;
                    if (oldRow?.id) await dexieTable(local).delete(String(oldRow.id));
                }
            } catch (err) {
                console.error(`Error processing realtime event for ${table}:`, err);
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Supabase Realtime Connection Established.');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                // Só reconecta se este canal ainda for o ativo (não após logout)
                if (realtimeChannel !== channel) return;
                console.warn('Realtime caiu. Tentando reconectar em 5 segundos...');
                supabase.removeChannel(channel);
                realtimeChannel = null;
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    if (realtimeUserId === userId) subscribeToRealtime(userId);
                }, 5000);
            }
        });

    realtimeChannel = channel;
}

export function unsubscribeFromRealtime() {
    realtimeUserId = null;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (realtimeChannel) {
        const channel = realtimeChannel;
        realtimeChannel = null;
        supabase.removeChannel(channel);
        console.log('Deactivated Supabase Realtime Sync.');
    }
}
