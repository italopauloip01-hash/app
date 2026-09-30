import 'fake-indexeddb/auto';

// Node não tem navigator.onLine nem localStorage como o navegador
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
    },
});
