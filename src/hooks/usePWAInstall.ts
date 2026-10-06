import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        globalDeferredPrompt = e as BeforeInstallPromptEvent;
        promptListeners.forEach((listener) => listener(globalDeferredPrompt));
    });

    window.addEventListener('appinstalled', () => {
        globalDeferredPrompt = null;
        promptListeners.forEach((listener) => listener(null));
    });
}

export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return true;
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://')
    );
}

export function isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua) ||
        (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua));
}

export function isIOS(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua));
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
    const [installed, setInstalled] = useState(isStandalone());
    const [showInstructions, setShowInstructions] = useState(false);

    const mobile = isMobileDevice();
    const ios = isIOS();
    const standalone = installed || isStandalone();

    useEffect(() => {
        const updatePrompt = (prompt: BeforeInstallPromptEvent | null) => {
            setDeferredPrompt(prompt);
        };
        promptListeners.add(updatePrompt);

        const checkInstalled = () => {
            if (isStandalone()) {
                setInstalled(true);
            }
        };

        window.addEventListener('appinstalled', checkInstalled);

        return () => {
            promptListeners.delete(updatePrompt);
            window.removeEventListener('appinstalled', checkInstalled);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (deferredPrompt) {
            try {
                await deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                    setInstalled(true);
                    globalDeferredPrompt = null;
                    setDeferredPrompt(null);
                }
            } catch (err) {
                console.error('Erro ao acionar instalação do PWA:', err);
                setShowInstructions(true);
            }
        } else {
            setShowInstructions(true);
        }
    }, [deferredPrompt]);

    return {
        isMobile: mobile,
        isIOS: ios,
        isStandalone: standalone,
        canInstall: mobile && !standalone,
        hasPrompt: !!deferredPrompt,
        showInstructions,
        setShowInstructions,
        promptInstall,
    };
}
