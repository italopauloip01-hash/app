import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendImageWithText } from './shareDocument';

// Imagem mínima válida em data URL
const DATA_URL = 'data:image/jpeg;base64,' + btoa('fake-jpeg-bytes');
const TEXT = '*EXTRATO DE DÉBITOS*\nCliente: Padaria Central\nTotal: R$ 650,00';

describe('enviar documento pelo WhatsApp (foto + texto)', () => {
    let share: ReturnType<typeof vi.fn>;
    let clipboard: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        share = vi.fn().mockResolvedValue(undefined);
        clipboard = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            share,
            canShare: () => true,
            clipboard: { writeText: clipboard },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('compartilha a imagem e o texto juntos e copia o texto', async () => {
        const result = await sendImageWithText({ dataUrl: DATA_URL, fileName: 'extrato.jpg', text: TEXT, title: 'Extrato' });
        expect(result).toBe('shared');
        expect(clipboard).toHaveBeenCalledWith(TEXT);
        const arg = share.mock.calls[0][0];
        expect(arg.text).toBe(TEXT);
        expect(arg.files).toHaveLength(1);
        expect(arg.files[0].name).toBe('extrato.jpg');
        expect(arg.files[0].type).toBe('image/jpeg');
    });

    it('fechar a tela de compartilhar não é erro', async () => {
        share.mockRejectedValue(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
        const result = await sendImageWithText({ dataUrl: DATA_URL, fileName: 'extrato.jpg', text: TEXT, title: 'Extrato' });
        expect(result).toBe('canceled');
    });

    it('sem compartilhamento de arquivos (computador): baixa a imagem e abre o WhatsApp com o texto', async () => {
        Object.assign(navigator, { canShare: () => false });
        const click = vi.fn();
        vi.stubGlobal('document', { createElement: () => ({ click, set download(_v: string) { /* */ }, set href(_v: string) { /* */ } }) });
        const open = vi.fn();
        vi.stubGlobal('window', { open });

        const result = await sendImageWithText({ dataUrl: DATA_URL, fileName: 'extrato.jpg', text: TEXT, title: 'Extrato', phone: '(11) 91234-5678' });
        expect(result).toBe('fallback');
        expect(click).toHaveBeenCalled(); // imagem baixada
        const url = open.mock.calls[0][0] as string;
        expect(url).toContain('https://wa.me/5511912345678');
        expect(decodeURIComponent(url.split('text=')[1])).toBe(TEXT);
    });
});
