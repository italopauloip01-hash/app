import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSettings } from '../hooks/useData';
import { exportDatabase, getLastAutoBackupTime, setLastAutoBackupTime } from '../utils/backup';

const BACKUP_INTERVAL_HOURS = 3;

export function AutoBackupManager() {
    const settings = useSettings();
    const enabled = !!settings?.autoBackupEnabled;

    useEffect(() => {
        // Backup automático só grava arquivo de verdade no app nativo.
        // No navegador não há como salvar arquivo sem o usuário clicar.
        if (!enabled || !Capacitor.isNativePlatform()) return;

        const checkBackup = async () => {
            const last = getLastAutoBackupTime();
            const diffInHours = (Date.now() - (last?.getTime() ?? 0)) / (1000 * 60 * 60);
            if (diffInHours < BACKUP_INTERVAL_HOURS) return;

            console.log('Triggering automatic backup...');
            if (await exportDatabase(true)) setLastAutoBackupTime(new Date());
        };

        const interval = setInterval(checkBackup, 5 * 60 * 1000);
        checkBackup();

        return () => clearInterval(interval);
    }, [enabled]);

    return null;
}
