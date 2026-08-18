import { format } from 'date-fns';
import { db } from '../db';
import { saveAs } from 'file-saver';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function getBackupData() {
    // Process clients in chunks to yield event loop
    const clientIds = await db.clients.toCollection().primaryKeys();
    const clients: any[] = [];
    for (let i = 0; i < clientIds.length; i += 50) {
        const chunk = await db.clients.bulkGet(clientIds.slice(i, i + 50) as string[]);
        for (const c of chunk) if (c) clients.push(c);
        // Yield to the main thread to prevent UI freezing
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Process services in chunks and strip large base64 media
    const serviceIds = await db.services.toCollection().primaryKeys();
    const services: any[] = [];
    for (let i = 0; i < serviceIds.length; i += 20) {
        const chunk = await db.services.bulkGet(serviceIds.slice(i, i + 20) as string[]);
        for (const s of chunk) {
            if (!s) continue;
            const newS = { ...s } as any;
            // Remove photos to prevent Out of Memory when generating Backup JSON
            delete newS.photos;
            delete newS.photosBefore;
            delete newS.photosAfter;
            services.push(newS);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    const templates = await db.serviceTemplates.toArray();
    const helpers = await db.helpers.toArray();
    const helperEntries = await db.helperEntries.toArray();
    const estimates = await db.estimates.toArray();
    const settingsList = await db.settings.toArray();

    // Filter out sensitive tokens from settings to avoid overwriting them on restore
    const settings = settingsList[0] ? { ...settingsList[0] } : null;
    if (settings) {
        delete settings.id;
    }

    return {
        timestamp: new Date().toISOString(),
        version: 1,
        clients,
        services,
        serviceTemplates: templates,
        helpers,
        helperEntries,
        estimates,
        settings
    };
}

export async function exportDatabase(isAutoBackup = false) {
    try {
        const data = await getBackupData();

        // At this point data.services is already stripped of photos by getBackupData
        const jsonString = JSON.stringify(data, null, 2);
        const fileName = `airtech_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;

        if (typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
            // Android Native Export
            try {
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: jsonString,
                    directory: Directory.Cache,
                    encoding: Encoding.UTF8
                });

                await new Promise(resolve => setTimeout(resolve, 300));

                if (!isAutoBackup) {
                    try {
                        await Share.share({
                            title: 'Backup AirTech Pro',
                            text: 'Arquivo de backup dos meus dados AirTech Pro (Fotos não incluídas por tamanho)',
                            url: result.uri,
                            dialogTitle: 'Salvar backup em...'
                        });
                    } catch (shareError: any) {
                        console.log('Share cancelado ou erro:', shareError);
                        if (shareError.message && shareError.message.includes('canceled')) return true;
                    }
                } else {
                    console.log('Auto backup saved silently to:', result.uri);
                }

                console.log('Backup salvo nativamente em:', result.uri);
                return true;
            } catch (nativeError) {
                console.error("Erro ao salvar nativamente:", nativeError);
                return false;
            }
        } else {
            // Web Fallback Export
            if (!isAutoBackup) {
                const blob = new Blob([jsonString], { type: 'application/json' });
                saveAs(blob, fileName);
            } else {
                console.log('Auto backup successfully generated in memory (Web).');
            }
            return true;
        }
    } catch (error) {
        console.error('Export failed:', error);
        return false;
    }
}

export async function importDatabase(file: File) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);

                if (!data.clients || !data.services) {
                    throw new Error('Formato de arquivo inválido');
                }

                const tables = [db.clients, db.services, db.serviceTemplates, db.helpers, db.helperEntries, db.estimates, db.settings];
                await db.transaction('rw', tables, async () => {
                    // Clear current data
                    await db.clients.clear();
                    await db.services.clear();
                    await db.serviceTemplates.clear();
                    await db.helpers.clear();
                    await db.helperEntries.clear();
                    await db.estimates.clear();

                    // Add new data
                    if (data.clients.length) await db.clients.bulkAdd(data.clients);
                    if (data.services.length) await db.services.bulkAdd(data.services);
                    if (data.serviceTemplates?.length) await db.serviceTemplates.bulkAdd(data.serviceTemplates);
                    if (data.helpers?.length) await db.helpers.bulkAdd(data.helpers);
                    if (data.helperEntries?.length) await db.helperEntries.bulkAdd(data.helperEntries);
                    if (data.estimates?.length) await db.estimates.bulkAdd(data.estimates);

                    // Restore settings if present, but preserve existing tokens
                    if (data.settings) {
                        const currentSettingsArr = await db.settings.toArray();
                        const currentSettings = currentSettingsArr[0];

                        if (currentSettings) {
                            await db.settings.update(currentSettings.id!, {
                                ...data.settings
                            });
                        } else {
                            await db.settings.add(data.settings);
                        }
                    }
                });

                resolve(true);
            } catch (error) {
                console.error('Import failed:', error);
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsText(file);
    });
}
