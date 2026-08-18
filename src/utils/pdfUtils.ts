export const TAILWIND_HEX_MAP: Record<string, string> = {
    'slate-50': '#f8fafc',
    'slate-100': '#f1f5f9',
    'slate-200': '#e2e8f0',
    'slate-300': '#cbd5e1',
    'slate-400': '#94a3b8',
    'slate-500': '#64748b',
    'slate-600': '#475569',
    'slate-700': '#334155',
    'slate-800': '#1e293b',
    'slate-900': '#0f172a',
    'slate-950': '#020617',

    'blue-50': '#eff6ff',
    'blue-100': '#dbeafe',
    'blue-200': '#bfdbfe',
    'blue-300': '#93c5fd',
    'blue-400': '#60a5fa',
    'blue-500': '#3b82f6',
    'blue-600': '#2563eb',
    'blue-700': '#1d4ed8',
    'blue-800': '#1e40af',
    'blue-900': '#1e3a8a',

    'indigo-50': '#eef2ff',
    'indigo-500': '#6366f1',
    'indigo-600': '#4f46e5',
    'indigo-700': '#4338ca',

    'purple-50': '#faf5ff',
    'purple-500': '#a855f7',
    'purple-600': '#9333ea',

    'zinc-50': '#fafafa',
    'zinc-100': '#f4f4f5',
    'zinc-200': '#e4e4e7',
    'zinc-500': '#71717a',
    'zinc-800': '#27272a',
    'zinc-900': '#18181b',

    'emerald-50': '#ecfdf5',
    'emerald-100': '#d1fae5',
    'emerald-500': '#10b981',
    'emerald-600': '#059669',
    'emerald-700': '#047857',

    'red-50': '#fef2f2',
    'red-500': '#ef4444',
    'red-600': '#dc2626',
    'red-700': '#b91c1c',

    'amber-50': '#fffbeb',
    'amber-500': '#f59e0b',
    'amber-600': '#d97706',
    'amber-700': '#b45309',

    'green-50': '#f0fdf4',
    'green-100': '#dcfce7',
    'green-500': '#22c55e',
    'green-600': '#16a34a',

    'white': '#ffffff',
    'black': '#000000',
    'transparent': 'transparent'
};

export function applyPrintColors(clonedDoc: Document) {
    // 1. EXTRACT AND INJECT ALL NATIVE STYLESHEETS
    // Extremely critical for Capacitor/Android because html2canvas fails to load <link> tags via file://
    let megaStyleString = '';
    try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
            try {
                if (sheet.cssRules) {
                    const rules = Array.from(sheet.cssRules);
                    megaStyleString += rules.map(rule => rule.cssText).join('\n') + '\n';
                }
            } catch (err) {
                // Ignore cross-origin stylesheet errors
            }
        }
    } catch (err) {
        console.warn('Could not extract document stylesheets', err);
    }

    let megaStyleTag: HTMLStyleElement | null = null;
    if (megaStyleString) {
        megaStyleTag = clonedDoc.createElement('style');
        // Safely wipe out oklch from the entire Tailwind bundle so html2canvas doesn't crash parsing it!
        megaStyleTag.innerHTML = megaStyleString.replace(/oklch\([^)]+\)/g, '#94a3b8');
        clonedDoc.head.appendChild(megaStyleTag);
    }

    // 2. SURGICAL STYLE CLEANUP (for existing inline <style> tags)
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach(style => {
        if (megaStyleTag && style === megaStyleTag) return;

        if (style.innerHTML.includes('oklch')) {
            style.innerHTML = style.innerHTML.replace(/oklch\([^)]+\)/g, '#cbd5e1');
        }
    });

    // 3. CLASS-TO-HEX MAPPING: Enforce inline colors just in case some Tailwind compilation misses
    const elements = clonedDoc.querySelectorAll('*');
    elements.forEach((el) => {
        const hEl = el as HTMLElement;
        const classes = hEl.className;

        if (typeof classes === 'string' && classes.length > 0) {
            const classList = classes.split(' ');
            classList.forEach(cls => {
                const getHex = (prefix: string) => {
                    if (cls.startsWith(prefix)) {
                        const val = cls.replace(prefix, '').split('/')[0];
                        // Support custom hex like text-[#0F172A]
                        if (val.startsWith('[#') && val.endsWith(']')) {
                            return val.slice(1, -1);
                        }
                        return TAILWIND_HEX_MAP[val];
                    }
                    return null;
                };

                const textColor = getHex('text-');
                if (textColor) hEl.style.color = textColor;

                const bgColor = getHex('bg-');
                if (bgColor) hEl.style.backgroundColor = bgColor;

                const borderColor = getHex('border-');
                if (borderColor) hEl.style.borderColor = borderColor;

                if (cls.startsWith('divide-')) {
                    const divColor = getHex('divide-');
                    if (divColor) hEl.style.borderColor = divColor;
                }
            });
        }

        // 4. INLINE STYLE SANITIZATION
        const styleAttr = hEl.getAttribute('style');
        if (styleAttr && styleAttr.includes('oklch')) {
            hEl.setAttribute('style', styleAttr.replace(/oklch\([^)]+\)/g, '#94a3b8'));
        }

        // 5. SVG SANITIZATION
        if (hEl instanceof SVGElement) {
            const fill = hEl.getAttribute('fill');
            if (fill && fill.includes('oklch')) hEl.setAttribute('fill', 'currentColor');
            const stroke = hEl.getAttribute('stroke');
            if (stroke && stroke.includes('oklch')) hEl.setAttribute('stroke', 'currentColor');
        }
    });

    // 6. THEME OVERRIDE & FONT INJECTION (With Bulletproof Tailwind Fallback for Android)
    const finalFix = clonedDoc.createElement('style');
    finalFix.innerHTML = `
        * {
            transition: none !important;
            animation: none !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        /* Garantir tipografia Premium e renderização base */
        body, #receipt-content, #statement-printable {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
        }
        
        /* BULLETPROOF TAILWIND FALLBACK FOR HTML2CANVAS ON ANDROID */
        .flex { display: flex !important; }
        .flex-col { flex-direction: column !important; }
        .justify-between { justify-content: space-between !important; }
        .justify-center { justify-content: center !important; }
        .justify-end { justify-content: flex-end !important; }
        .items-start { align-items: flex-start !important; }
        .items-end { align-items: flex-end !important; }
        .items-center { align-items: center !important; }
        .flex-1 { flex: 1 1 0% !important; }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .text-left { text-align: left !important; }
        
        .font-normal { font-weight: 400 !important; }
        .font-medium { font-weight: 500 !important; }
        .font-semibold { font-weight: 600 !important; }
        .font-bold { font-weight: 700 !important; }
        .font-black { font-weight: 900 !important; }
        
        .uppercase { text-transform: uppercase !important; }
        .italic { font-style: italic !important; }
        .tracking-tight { letter-spacing: -0.025em !important; }
        .tracking-wider { letter-spacing: 0.05em !important; }
        .tracking-widest { letter-spacing: 0.1em !important; }
        .leading-none { line-height: 1 !important; }
        .leading-tight { line-height: 1.25 !important; }
        
        .w-full { width: 100% !important; }
        .w-16 { width: 4rem !important; }
        .w-32 { width: 8rem !important; }
        .w-\\[140px\\] { width: 140px !important; }
        .w-\\[180px\\] { width: 180px !important; }
        .w-\\[260px\\] { width: 260px !important; }
        .w-\\[280px\\] { width: 280px !important; }
        .w-\\[800px\\] { width: 800px !important; }
        .min-w-\\[800px\\] { min-width: 800px !important; }
        .min-w-\\[320px\\] { min-width: 320px !important; }
        .max-w-lg { max-width: 32rem !important; }
        .max-w-\\[21cm\\] { max-width: 21cm !important; }
        
        .h-16 { height: 4rem !important; }
        .h-\\[40px\\] { height: 40px !important; }
        .h-\\[140px\\] { height: 140px !important; }
        .h-\\[180px\\] { height: 180px !important; }
        
        .mx-auto { margin-left: auto !important; margin-right: auto !important; }
        .mt-auto { margin-top: auto !important; }
        .mt-1 { margin-top: 0.25rem !important; }
        .mt-2 { margin-top: 0.5rem !important; }
        .mt-4 { margin-top: 1rem !important; }
        .mt-8 { margin-top: 2rem !important; }
        .mt-10 { margin-top: 2.5rem !important; }
        .mt-12 { margin-top: 3rem !important; }
        
        .mb-1 { margin-bottom: 0.25rem !important; }
        .mb-2 { margin-bottom: 0.5rem !important; }
        .mb-3 { margin-bottom: 0.75rem !important; }
        .mb-4 { margin-bottom: 1rem !important; }
        .mb-6 { margin-bottom: 1.5rem !important; }
        .mb-8 { margin-bottom: 2rem !important; }
        
        .pb-2 { padding-bottom: 0.5rem !important; }
        .pb-6 { padding-bottom: 1.5rem !important; }
        .pb-\\[20px\\] { padding-bottom: 20px !important; }
        .pt-8 { padding-top: 2rem !important; }
        .pt-\\[8px\\] { padding-top: 8px !important; }
        .py-4 { padding-top: 1rem !important; padding-bottom: 1rem !important; }
        .py-8 { padding-top: 2rem !important; padding-bottom: 2rem !important; }
        
        .p-4 { padding: 1rem !important; }
        .p-5 { padding: 1.25rem !important; }
        .p-6 { padding: 1.5rem !important; }
        .p-8 { padding: 2rem !important; }
        .p-10 { padding: 2.5rem !important; }
        
        .gap-2 { gap: 0.5rem !important; }
        .gap-6 { gap: 1.5rem !important; }
        .gap-12 { gap: 3rem !important; }
        
        .space-y-\\[2px\\] > :not([hidden]) ~ :not([hidden]) { margin-top: 2px !important; }
        .space-y-\\[4px\\] > :not([hidden]) ~ :not([hidden]) { margin-top: 4px !important; }
        .space-y-0 > :not([hidden]) ~ :not([hidden]) { margin-top: 0px !important; }
        
        .border-b-2, .border-b-\\[2px\\] { border-bottom-width: 2px !important; border-bottom-style: solid !important; }
        .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
        .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
        .border { border-width: 1px !important; border-style: solid !important; }
        
        .rounded-\\[8px\\] { border-radius: 8px !important; }
        .rounded-\\[10px\\] { border-radius: 10px !important; }
        .rounded-\\[16px\\] { border-radius: 16px !important; }
        .rounded-\\[24px\\] { border-radius: 24px !important; }
        
        .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
        .text-base { font-size: 1rem !important; line-height: 1.5rem !important; }
        .text-lg { font-size: 1.125rem !important; line-height: 1.75rem !important; }
        .text-xl { font-size: 1.25rem !important; line-height: 1.75rem !important; }
        
        .text-\\[9px\\] { font-size: 9px !important; }
        .text-\\[10px\\] { font-size: 10px !important; }
        .text-\\[11px\\] { font-size: 11px !important; }
        .text-\\[12px\\] { font-size: 12px !important; }
        .text-\\[13px\\] { font-size: 13px !important; }
        .text-\\[14px\\] { font-size: 14px !important; }
        .text-\\[15px\\] { font-size: 15px !important; }
        .text-\\[18px\\] { font-size: 18px !important; }
        .text-\\[22px\\] { font-size: 22px !important; }
        .text-\\[28px\\] { font-size: 28px !important; }
        .text-\\[32px\\] { font-size: 32px !important; }
        
        .absolute { position: absolute !important; }
        .relative { position: relative !important; }
        .bottom-\\[100\\%\\] { bottom: 100% !important; }
        .left-1\\/2 { left: 50% !important; }
        .transform { transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) !important; }
        .-translate-x-1\\/2 { --tw-translate-x: -50% !important; transform: translateX(-50%) !important; }
        
        .inline-block { display: inline-block !important; }
        .object-contain { object-fit: contain !important; }
        .overflow-hidden { overflow: hidden !important; }

        /* Cores base forçadas */
        .bg-blue-600 { background-color: #2563eb !important; }
        .text-white { color: #ffffff !important; }
        .forced-light { background-color: #ffffff !important; color: #0f172a !important; }
    `;
    clonedDoc.head.appendChild(finalFix);
}


