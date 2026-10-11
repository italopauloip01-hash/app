import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generatePixPayload, openPixWhatsApp, copyPixCode, getPixPaymentUrl } from './PixUtils';

describe('PixUtils', () => {
    let clipboardWriteText: ReturnType<typeof vi.fn>;
    let windowOpen: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        windowOpen = vi.fn();
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });
        vi.stubGlobal('window', {
            open: windowOpen,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('generatePixPayload', () => {
        it('gera payload Pix BRCode válido com chave, valor e identificador', () => {
            const result = generatePixPayload('11999998888', 250.50, 'AIRTECH REFRIGERACAO');
            expect(result.copyAndPaste).toContain('000201');
            expect(result.copyAndPaste).toContain('br.gov.bcb.pix');
            expect(result.copyAndPaste).toContain('250.50');
            expect(result.copyAndPaste).toContain('AIRTECH');
            expect(result.copyAndPaste).toMatch(/6304[A-F0-9]{4}$/); // CRC16 no final
            expect(result.qrCodeUrl).toContain('create-qr-code');
        });
    });

    describe('openPixWhatsApp', () => {
        it('abre o WhatsApp enviando EXCLUSIVAMENTE o código Pix puro e copia para clipboard', async () => {
            const rawPixCode = '00020126580014br.gov.bcb.pix0136fakekey6304ABCD';
            await openPixWhatsApp(rawPixCode, '11988887777');

            // Copia para área de transferência
            expect(clipboardWriteText).toHaveBeenCalledWith(rawPixCode);

            // Abre wa.me apenas com o código no parâmetro text
            expect(windowOpen).toHaveBeenCalledTimes(1);
            const calledUrl = windowOpen.mock.calls[0][0];
            expect(calledUrl).toContain('https://wa.me/5511988887777?text=');
            expect(decodeURIComponent(calledUrl.split('text=')[1])).toBe(rawPixCode);
        });
    });

    describe('copyPixCode', () => {
        it('copia o código Pix para a área de transferência', async () => {
            const rawPixCode = '00020126580014br.gov.bcb.pix0136fakekey6304ABCD';
            const ok = await copyPixCode(rawPixCode);
            expect(ok).toBe(true);
            expect(clipboardWriteText).toHaveBeenCalledWith(rawPixCode);
        });
    });

    describe('getPixPaymentUrl', () => {
        it('gera URL da página /pix com os parâmetros corretos', () => {
            const rawPixCode = '00020126580014br.gov.bcb.pix0136fakekey6304ABCD';
            const urlString = getPixPaymentUrl(rawPixCode, 150.00, 'AirTech', '11999998888', 'João Silva');
            expect(urlString).toContain('/pix?');
            const parsedUrl = new URL(urlString);
            expect(parsedUrl.searchParams.get('c')).toBe(rawPixCode);
            expect(parsedUrl.searchParams.get('v')).toBe('150.00');
            expect(parsedUrl.searchParams.get('nome')).toBe('AirTech');
            expect(parsedUrl.searchParams.get('chave')).toBe('11999998888');
            expect(parsedUrl.searchParams.get('cli')).toBe('João Silva');
        });
    });
});

