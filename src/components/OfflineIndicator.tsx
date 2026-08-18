import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline) return null;

    return (
        <div className="bg-slate-800 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 animate-fade-in shadow-lg">
            <WifiOff size={16} className="text-red-400" />
            <span>Você está offline. O modo offline está ativo.</span>
        </div>
    );
}
