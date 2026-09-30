import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { saveAs } from 'file-saver';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, type LocalTableName } from '../db';
import type { Client, Service, ServiceTemplate, Helper, HelperEntry, Estimate, CompanySettings } from '../types';
import { normalizeRecord } from './normalize';

const AUTO_BACKUP_DIR = 'AirTechPro';
const AUTO_BACKUP_PREFIX = 'airtech_auto_';
const AUTO_BACKUPS_TO_KEEP = 5;
const LAST_AUTO_BACKUP_KEY = 'airtech:lastAutoBackupTime';

export interface BackupData {
    timestamp: string;
    version: number;
    clients: Client[];
    services: Service[];
    serviceTemplates: ServiceTemplate[];
    helpers: Helper[];
    helperEntries: HelperEntry[];
    estimates: Estimate[];
    settings: CompanySettings | null;
}

// O horário do último backup automático é por aparelho, então fica fora das
// configurações sincronizadas.
export function getLastAutoBackupTime(): Date | null {
    try {
        const v = localStorage.getItem(LAST_AUTO_BACKUP_KEY);
        return v ? new Date(v) : null;
    } catch {
        return null;
    }
}

export function setLastAutoBackupTime(date: Date) {
    try { localStorage.setItem(LAST_AUTO_BACKUP_KEY, date.toISOString()); } catch { /* storage indisponível */ }
}

const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 5));

export async function getBackupData(): Promise<BackupData> {
    // Lê em blocos para não travar a interface com bases grandes
    const clientIds = (await db.clients.toCollection().primaryKeys()) as string[];
    const clients: Client[] = [];
    for (let i = 0; i < clientIds.length; i += 50) {
        const chunk = await db.clients.bulkGet(clientIds.slice(i, i + 50));
        for (const c of chunk) if (c) clients.push(c);
        await yieldToUI();
    }

    const serviceIds = (await db.services.toCollection().primaryKeys()) as string[];
    const services: Service[] = [];
    for (let i = 0; i < serviceIds.length; i += 20) {
        const chunk = await db.services.bulkGet(serviceIds.slice(i, i + 20));
        for (const s of chunk) {
            if (!s) continue;
            // Fotos ficam de fora para o arquivo não estourar a memória.
            // (Na restauração, as fotos já existentes são preservadas.)
            services.push({ ...s, photos: [], photosBefore: undefined, photosAfter: undefined });
        }
        await yieldToUI();
    }

    const settingsList = await db.settings.toArray();
    const settings = settingsList[0] ? { ...settingsList[0] } : null;
    if (settings) delete settings.id;

    return {
        timestamp: new Date().toISOString(),
        version: 1,
        clients,
        services,
        serviceTemplates: await db.serviceTemplates.toArray(),
        helpers: await db.helpers.toArray(),
        helperEntries: await db.helperEntries.toArray(),
        estimates: await db.estimates.toArray(),
        settings,
    };
}

async function saveAutoBackupNative(jsonString: string): Promise<string> {
    const fileName = `${AUTO_BACKUP_PREFIX}${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
    const path = `${AUTO_BACKUP_DIR}/${fileName}`;

    // Documents sobrevive a limpezas de cache; Data é o fallback (privado do app)
    let directory = Directory.Documents;
    let result;
    try {
        result = await Filesystem.writeFile({ path, data: jsonString, directory, encoding: Encoding.UTF8, recursive: true });
    } catch (err) {
        console.warn('Sem acesso a Documentos, salvando na pasta do app:', err);
        directory = Directory.Data;
        result = await Filesystem.writeFile({ path, data: jsonString, directory, encoding: Encoding.UTF8, recursive: true });
    }

    // Mantém só os backups automáticos mais recentes
    try {
        const { files } = await Filesystem.readdir({ path: AUTO_BACKUP_DIR, directory });
        const old = files
            .map(f => f.name)
            .filter(name => name.startsWith(AUTO_BACKUP_PREFIX))
            .sort()
            .reverse()
            .slice(AUTO_BACKUPS_TO_KEEP);
        for (const name of old) {
            await Filesystem.deleteFile({ path: `${AUTO_BACKUP_DIR}/${name}`, directory });
        }
    } catch (err) {
        console.warn('Não foi possível limpar backups antigos:', err);
    }

    return result.uri;
}

/**
 * Manual: abre o compartilhamento (Android) ou baixa o arquivo (web).
 * Automático: grava silenciosamente em Documentos/AirTechPro (só Android).
 * Retorna true apenas se um arquivo foi realmente salvo/compartilhado.
 */
export async function exportDatabase(isAutoBackup = false): Promise<boolean> {
    const isNative = Capacitor.isNativePlatform();
    if (isAutoBackup && !isNative) return false;

    try {
        const data = await getBackupData();
        const jsonString = JSON.stringify(data, null, 2);

        if (isAutoBackup) {
            const uri = await saveAutoBackupNative(jsonString);
            console.log('Backup automático salvo em:', uri);
            return true;
        }

        const fileName = `airtech_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;

        if (isNative) {
            const result = await Filesystem.writeFile({
                path: fileName,
                data: jsonString,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
            });
            try {
                await Share.share({
                    title: 'Backup AirTech Pro',
                    text: 'Arquivo de backup dos meus dados AirTech Pro (Fotos não incluídas por tamanho)',
                    url: result.uri,
                    dialogTitle: 'Salvar backup em...',
                });
            } catch (shareError) {
                // Usuário fechou a tela de compartilhar sem escolher destino
                console.log('Compartilhamento cancelado:', shareError);
                return false;
            }
            return true;
        }

        saveAs(new Blob([jsonString], { type: 'application/json' }), fileName);
        return true;
    } catch (error) {
        console.error('Export failed:', error);
        return false;
    }
}

export async function importDatabase(file: File): Promise<void> {
    const text = await file.text();
    const data = JSON.parse(text) as Partial<BackupData>;

    if (!Array.isArray(data.clients) || !Array.isArray(data.services)) {
        throw new Error('Formato de arquivo inválido');
    }

    // Baixa antes o estado da nuvem (incluindo fotos), para a mesclagem abaixo
    // preservar fotos de serviços que ainda não estavam neste aparelho.
    const { enqueueUpserts, syncDatabase } = await import('../lib/supabaseOperations');
    await syncDatabase();

    const norm = <T,>(list: T[] | undefined): T[] =>
        (list ?? []).map(r => normalizeRecord(r as Record<string, unknown>) as T);

    const imported: Record<Exclude<LocalTableName, 'settings'>, { id?: string }[]> = {
        clients: norm(data.clients),
        services: norm(data.services),
        serviceTemplates: norm(data.serviceTemplates),
        helpers: norm(data.helpers),
        helperEntries: norm(data.helperEntries),
        estimates: norm(data.estimates),
    };

    const tables = [db.clients, db.services, db.serviceTemplates, db.helpers, db.helperEntries, db.estimates, db.settings];
    await db.transaction('rw', tables, async () => {
        // O backup não contém fotos: preserva as fotos que já existem no aparelho,
        // senão a restauração apagaria as fotos também na nuvem.
        const existingServices = new Map((await db.services.toArray()).map(s => [s.id, s]));
        imported.services = (imported.services as Service[]).map(s => {
            const current = existingServices.get(s.id);
            if (!current) return s;
            return {
                ...s,
                photos: s.photos?.length ? s.photos : current.photos,
                photosBefore: s.photosBefore?.length ? s.photosBefore : current.photosBefore,
                photosAfter: s.photosAfter?.length ? s.photosAfter : current.photosAfter,
            };
        });

        for (const [table, rows] of Object.entries(imported)) {
            const t = db.table(table);
            await t.clear();
            if (rows.length) await t.bulkPut(rows);
        }

        if (data.settings) {
            const current = (await db.settings.toArray())[0];
            if (current) {
                await db.settings.update(current.id!, { ...data.settings });
            } else {
                await db.settings.add(data.settings);
            }
        }
    });

    // Envia os dados restaurados para a nuvem
    for (const [table, rows] of Object.entries(imported)) {
        await enqueueUpserts(table as LocalTableName, rows.map(r => r.id!).filter(Boolean));
    }
    const settingsRow = (await db.settings.toArray())[0];
    if (settingsRow?.id) await enqueueUpserts('settings', [settingsRow.id]);
    await syncDatabase();
}
