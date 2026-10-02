import { useEffect } from 'react';

/**
 * Trava a rolagem da página de trás enquanto uma janela (modal) está aberta.
 * No celular, sem isso, arrastar dentro da janela rola a tela que está atrás.
 */
export function useLockBodyScroll(active = true) {
    useEffect(() => {
        if (!active) return;
        const html = document.documentElement;
        const previous = { html: html.style.overflow, body: document.body.style.overflow };
        html.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        return () => {
            html.style.overflow = previous.html;
            document.body.style.overflow = previous.body;
        };
    }, [active]);
}
