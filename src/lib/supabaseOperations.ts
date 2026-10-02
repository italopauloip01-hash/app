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
// Proteção das fotos
// --------------------------------------------
// Fotos ficam em base64 dentro do serviço. Já houve dois caminhos que apagavam fotos:
// avisos do Realtime (que omitem campos grandes em registros > 1 MB) gravados por cima
// do registro local, e envios em lote em que linhas sem o campo viravam NULL na nuvem.
// Regra: se a nuvem não tem as fotos (null/ausente) e o aparelho tem, o aparelho vence
// e as fotos são reenviadas. Lista vazia [] na nuvem é remoção intencional e é aceita.
// ============================================
const PHOTO_FIELDS = ['photos', 'photosBefore', 'photosAfter'] as const;
const REMOTE_PHOTO_COLUMNS = ['photos', 'photos_before', 'photos_after'];

/**
 * Campos que existem no aparelho mas não vieram da nuvem (coluna ainda não criada no
 * Supabase, ex.: horário da agenda) são mantidos, senão o download os apagaria.
 * Campo que veio como null da nuvem foi limpo de propósito e é aceito.
 */
export function keepLocalOnlyFields(incoming: AnyRecord, current: AnyRecord | undefined) {
    if (!current) return;
    for (const key of Object.keys(current)) {
        if (!(key in incoming)) incoming[key] = current[key];
    }
}

// Colunas que o Supabase ainda não tem (migração não aplicada). O campo continua salvo
// no aparelho e só deixa de subir até a coluna existir. A lista é esquecida a cada
// sincronização completa, então assim que a migração rodar o campo volta a subir.
const missingColumns = new Map<string, Set<string>>();

function missingColumnFrom(error: { message?: string } | null): string | null {
    return /Could not find the '([^']+)' column/.exec(error?.message ?? '')?.[1] ?? null;
}

function withoutMissingColumns(remote: string, row: AnyRecord): AnyRecord {
    const missing = missingColumns.get(remote);
    if (!missing?.size) return row;
    const copy = { ...row };
    for (const col of missing) delete copy[col];
    return copy;
}

/** Mantém no registro vindo da nuvem as fotos que só existem no aparelho. Retorna true se manteve alguma. */
export function keepLocalPhotos(incoming: AnyRecord, current: AnyRecord | undefined): boolean {
    if (!current) return false;
    let kept = false;
    for (const field of PHOTO_FIELDS) {
        const remoteValue = incoming[field];
        const localValue = current[field];
        if ((remoteValue === null || remoteValue === undefined) && Array.isArray(localValue) && localValue.length > 0) {
            incoming[field] = localValue;
            kept = true;
        }
    }
    return kept;
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
            const { error } = await supabase.from(remote).delete().in('id', deletes.map(e => e.recordId)).abortSignal(timeout(60000));
            if (error) console.error(`Falha ao excluir em ${remote}:`, error);
            else await acknowledge(deletes);
        }

        // Inclusões/alterações
        const upserts = tableEntries.filter(e => e.op === 'upsert');
        for (let i = 0; i < upserts.length; i += PUSH_CHUNK_SIZE) {
            const chunk = upserts.slice(i, i + PUSH_CHUNK_SIZE);
            const records = await dexieTable(local).bulkGet(chunk.map(e => e.recordId));

            // Agrupa por conjunto de campos: num envio em lote, o Supabase grava NULL nas
            // colunas que faltam em alguma linha. Separando, cada linha só altera os campos
            // que ela tem (ex.: serviço sem o campo de fotos não apaga as fotos da nuvem).
            const groups = new Map<string, { rows: AnyRecord[]; entries: OutboxEntry[] }>();
            const missing: OutboxEntry[] = [];
            chunk.forEach((entry, idx) => {
                const rec = records[idx];
                if (!rec) {
                    missing.push(entry); // apagado localmente depois; a exclusão tem entrada própria
                    return;
                }
                const row = toRemoteRow(rec, userId);
                // Campo presente mas vazio = limpar na nuvem (null). Campo ausente = não mexer.
                for (const key of Object.keys(row)) if (row[key] === undefined) row[key] = null;
                // Fotos nunca sobem como null (isso apagaria na nuvem). Remover fotos de
                // propósito grava lista vazia [], que sobe normalmente.
                for (const key of REMOTE_PHOTO_COLUMNS) if (row[key] === null) delete row[key];
                const signature = Object.keys(row).sort().join(',');
                if (!groups.has(signature)) groups.set(signature, { rows: [], entries: [] });
                groups.get(signature)!.rows.push(row);
                groups.get(signature)!.entries.push(entry);
            });
            if (missing.length) await acknowledge(missing);

            const onConflict = local === 'settings' ? 'user_id' : 'id';
            let failed = false;
            for (const group of groups.values()) {
                let sent = false;
                for (let attempt = 0; attempt < 10; attempt++) {
                    const rows = group.rows.map(r => withoutMissingColumns(remote, r));
                    const { error } = await supabase.from(remote).upsert(rows, { onConflict }).abortSignal(timeout(120000));
                    if (!error) {
                        sent = true;
                        break;
                    }
                    const column = missingColumnFrom(error);
                    if (!column) {
                        console.error(`Falha ao enviar ${remote}:`, error);
                        break;
                    }
                    console.warn(`Coluna "${column}" ainda não existe em ${remote}; enviando sem ela (fica salva no aparelho).`);
                    if (!missingColumns.has(remote)) missingColumns.set(remote, new Set());
                    missingColumns.get(remote)!.add(column);
                }
                if (!sent) {
                    failed = true;
                    break;
                }
                await acknowledge(group.entries);
                group.entries.forEach(e => markJustPushed(e.key));
            }
            if (failed) break; // mantém o restante na fila para a próxima tentativa
        }
    }
}

// Registros enviados há pouco: o Realtime devolve o mesmo registro ("eco") logo depois;
// não é preciso processar (e, com fotos, buscar de novo) o que já está igual aqui.
const justPushed = new Map<string, number>();
const ECHO_WINDOW_MS = 20000;

function markJustPushed(key: string) {
    justPushed.set(key, Date.now());
}

function wasJustPushed(key: string): boolean {
    const at = justPushed.get(key);
    if (at === undefined) return false;
    if (Date.now() - at > ECHO_WINDOW_MS) {
        justPushed.delete(key);
        return false;
    }
    return true;
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

/** Sinal que cancela a requisição se ela travar (rede ruim no campo). */
function timeout(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

/**
 * Colunas de serviços SEM as fotos. As fotos (base64) são a parte pesada: os dados
 * (clientes, serviços, valores) chegam rápido e as fotos vêm depois, em segundo plano.
 */
let lightColumnsCache: string | null = null; // descobertas 1x por sessão do app

async function lightServiceColumns(): Promise<string | null> {
    if (lightColumnsCache) return lightColumnsCache;
    const { data, error } = await supabase.from('services').select('*').limit(1).abortSignal(timeout(30000));
    if (error) {
        console.error('Falha ao ler colunas de services:', error);
        return null;
    }
    if (!data || data.length === 0) return '*';
    lightColumnsCache = Object.keys(data[0] as AnyRecord).filter(k => !REMOTE_PHOTO_COLUMNS.includes(k)).join(',');
    return lightColumnsCache;
}

async function fetchAllRows(remote: string, columns = '*'): Promise<AnyRecord[] | null> {
    const all: AnyRecord[] = [];
    for (let from = 0; ; from += PULL_PAGE_SIZE) {
        const { data, error } = await supabase
            .from(remote)
            .select(columns)
            .order('id')
            .range(from, from + PULL_PAGE_SIZE - 1)
            .abortSignal(timeout(30000));
        if (error) {
            console.error(`Falha ao baixar ${remote}:`, error);
            return null;
        }
        all.push(...(data as unknown as AnyRecord[]));
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

/**
 * 1. Baixa os dados SEM fotos (rápido: telas e somas do mês ficam prontas em segundos)
 * 2. Envia as alterações feitas neste aparelho
 * 3. Em segundo plano, baixa fotos que faltam aqui (ou confere todas, 1x por dia)
 */
export async function syncDatabase(opts: { fullPhotos?: boolean } = {}): Promise<SyncResult> {
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
        missingColumns.clear(); // reavalia: a migração pode ter sido aplicada

        // 1. Dados (sem fotos)
        for (const { local, remote } of SYNCED_TABLES) {
            let columns = '*';
            if (remote === 'services') {
                const light = await lightServiceColumns();
                if (light === null) {
                    ok = false;
                    continue;
                }
                columns = light;
            }
            const remoteRows = await fetchAllRows(remote, columns);
            if (remoteRows === null) {
                if (remote === 'services') lightColumnsCache = null;
                ok = false;
                continue;
            }
            await applyRemoteRows(local, remoteRows);
        }

        // 2. Alterações deste aparelho
        await flushOutbox();
        console.log('Sync complete.');
    } catch (error) {
        console.error('Master Sync failed:', error);
        ok = false;
    } finally {
        setSyncing(false);
    }

    // 3. Fotos (não segura o indicador de "sincronizando")
    if (ok) await syncPhotos(opts.fullPhotos ?? isFullPhotoCheckDue());

    const pending = await pendingNow();
    return { ok: ok && pending === 0, pending, reason: ok && pending === 0 ? undefined : 'error' };
}

/** Grava no aparelho as linhas vindas da nuvem, sem perder alterações locais pendentes. */
async function applyRemoteRows(local: LocalTableName, remoteRows: AnyRecord[]) {
    const pending = new Set(
        (await db.outbox.where('table').equals(local).toArray()).map(e => e.recordId)
    );
    // Não sobrescreve registros com alteração local ainda não enviada
    const incoming = remoteRows.map(fromRemoteRow).filter(r => !pending.has(String(r.id)));

    if (local === 'settings') {
        if (incoming.length > 0 && pending.size === 0) {
            await db.transaction('rw', db.settings, async () => {
                const current = (await db.settings.toArray())[0];
                keepLocalOnlyFields(incoming[0], current as unknown as AnyRecord);
                await db.settings.clear();
                await db.settings.put(incoming[0] as unknown as CompanySettings);
            });
        }
        return;
    }

    // Campos que não vieram (fotos, colunas que a nuvem ainda não tem) continuam os do aparelho
    if (incoming.length > 0) {
        const current = await dexieTable(local).bulkGet(incoming.map(r => String(r.id)));
        incoming.forEach((r, i) => keepLocalOnlyFields(r, current[i]));
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

// ============================================
// Fotos (segundo plano)
// ============================================
const LAST_FULL_PHOTO_CHECK_KEY = 'airtech:lastFullPhotoCheck';
const PHOTO_BATCH_SIZE = 10;
let photosSyncing: Promise<void> | null = null;

/** Conferência completa das fotos (inclui recuperar fotos que sumiram da nuvem) 1x por dia. */
function isFullPhotoCheckDue(): boolean {
    try {
        const last = Number(localStorage.getItem(LAST_FULL_PHOTO_CHECK_KEY) || 0);
        return Date.now() - last > 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

export function syncPhotos(full = false): Promise<void> {
    if (!photosSyncing) {
        photosSyncing = doSyncPhotos(full)
            .catch(err => console.warn('Sincronização de fotos falhou:', err))
            .finally(() => { photosSyncing = null; });
    }
    return photosSyncing;
}

async function doSyncPhotos(full: boolean) {
    const services = await db.services.toArray();
    // Normal: só serviços que ainda não têm as fotos neste aparelho (ex.: aparelho novo).
    // Completo: todos (pega fotos alteradas em outro aparelho e recupera as que sumiram da nuvem).
    const ids = services
        .filter(s => full || !PHOTO_FIELDS.some(f => f in s))
        .map(s => String(s.id));

    const healIds: string[] = [];
    for (let i = 0; i < ids.length; i += PHOTO_BATCH_SIZE) {
        const batch = ids.slice(i, i + PHOTO_BATCH_SIZE);
        const { data, error } = await supabase
            .from('services')
            .select(['id', ...REMOTE_PHOTO_COLUMNS].join(','))
            .in('id', batch)
            .abortSignal(timeout(60000));
        if (error) {
            console.warn('Falha ao baixar fotos:', error);
            return; // tenta de novo na próxima sincronização
        }
        for (const row of (data ?? []) as unknown as AnyRecord[]) {
            const id = String(row.id);
            if (await db.outbox.get(`services:${id}`)) continue; // alteração local pendente vence
            const photos = fromRemoteRow(row);
            delete photos.id;
            const current = await db.services.get(id);
            if (keepLocalPhotos(photos, current as unknown as AnyRecord)) healIds.push(id);
            await dexieTable('services').update(id, photos);
        }
    }

    if (full) {
        try { localStorage.setItem(LAST_FULL_PHOTO_CHECK_KEY, String(Date.now())); } catch { /* storage indisponível */ }
    }
    if (healIds.length > 0) {
        console.warn(`Reenviando fotos de ${healIds.length} serviço(s) que estavam sem fotos na nuvem.`);
        await enqueueUpserts('services', healIds);
        await flushOutbox();
    }
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
                if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow?.id) {
                    // Ignora eco de alteração local ainda pendente
                    if (await db.outbox.get(`${local}:${newRow.id}`)) return;

                    // Eco de algo que este aparelho acabou de enviar: já está igual aqui
                    if (wasJustPushed(`${local}:${newRow.id}`)) return;

                    // Acima de 1 MB o aviso do Realtime vem cortado (só campos pequenos, sem
                    // fotos/itens). Nesse caso busca a linha inteira; senão usa o próprio aviso.
                    let row: AnyRecord = newRow;
                    const truncated = local === 'services' && !REMOTE_PHOTO_COLUMNS.every(col => col in newRow);
                    if (truncated) {
                        const { data, error } = await supabase.from(table).select('*').eq('id', newRow.id).abortSignal(timeout(60000)).maybeSingle();
                        if (error || !data) return; // o próximo sync resolve
                        row = data as AnyRecord;
                    }
                    if (await db.outbox.get(`${local}:${newRow.id}`)) return; // mudou localmente enquanto buscava

                    const record = fromRemoteRow(row);
                    if (local === 'settings') {
                        await db.transaction('rw', db.settings, async () => {
                            const currentSettings = (await db.settings.toArray())[0];
                            keepLocalOnlyFields(record, currentSettings as unknown as AnyRecord);
                            await db.settings.clear();
                            await db.settings.put(record as unknown as CompanySettings);
                        });
                    } else {
                        const current = await dexieTable(local).get(String(record.id));
                        keepLocalOnlyFields(record, current);
                        const kept = local === 'services' && keepLocalPhotos(record, current);
                        await dexieTable(local).put(record);
                        if (kept) await enqueueUpserts(local, [String(record.id)]);
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
