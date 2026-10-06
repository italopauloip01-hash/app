import { useState, useEffect } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { InstallAppModal } from './InstallAppModal';

const DISMISS_KEY = 'airtech_pwa_banner_dismissed';

export function InstallAppBanner() {
    const { canInstall, isIOS, promptInstall, showInstructions, setShowInstructions } = usePWAInstall();
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        const isDismissed = sessionStorage.getItem(DISMISS_KEY) === 'true';
        setDismissed(isDismissed);
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem(DISMISS_KEY, 'true');
    };

    if (!canInstall || dismissed) {
        return (
            <InstallAppModal
                isOpen={showInstructions}
                onClose={() => setShowInstructions(false)}
                isIOS={isIOS}
            />
        );
    }

    return (
        <>
            <aside
                aria-label="Aviso de instalação do aplicativo"
                className="fixed top-3 inset-x-3 z-50 animate-slide-down max-w-md mx-auto"
            >
                <div className="bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md p-3.5 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/40">
                            <Smartphone className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold truncate">Instalar AirTech Pro</p>
                            <p className="text-[11px] text-slate-300 truncate">Acesse direto da tela inicial</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={promptInstall}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                        >
                            <Download size={13} />
                            <span>Instalar</span>
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                            aria-label="Dispensar"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            <InstallAppModal
                isOpen={showInstructions}
                onClose={() => setShowInstructions(false)}
                isIOS={isIOS}
            />
        </>
    );
}
