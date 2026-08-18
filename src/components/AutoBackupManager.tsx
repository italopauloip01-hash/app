import { useEffect } from 'react';
import { useSettings } from '../hooks/useData';
import { db } from '../db';
import { exportDatabase } from '../utils/backup';

export function AutoBackupManager() {
    const settings = useSettings();

    useEffect(() => {
        if (!settings?.autoBackupEnabled) return;

        const checkBackup = async () => {
            const now = new Date();
            const lastBackup = settings.lastAutoBackupTime
                ? new Date(settings.lastAutoBackupTime)
                : new Date(0); // If never backed up, set to epoch

            const diffInHours = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60);

            if (diffInHours >= 3) {
                console.log("Triggering automatic backup...");
                const success = await exportDatabase(true);

                if (success) {
                    // Update last backup time
                    const currentSettings = await db.settings.toArray();
                    if (currentSettings.length > 0) {
                        await db.settings.update(currentSettings[0].id!, {
                            lastAutoBackupTime: new Date().toISOString()
                        });
                    }
                }
            }
        };

        // Check every 5 minutes
        const interval = setInterval(checkBackup, 5 * 60 * 1000);

        // Also check immediately on load
        checkBackup();

        return () => clearInterval(interval);
    }, [settings]);

    return null; // This component doesn't render anything
}
