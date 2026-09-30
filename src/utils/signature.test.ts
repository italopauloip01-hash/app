import { describe, it, expect } from 'vitest';
import { extractInk, findOpaqueBox } from './signature';

// Simula uma foto de celular: papel com sombra (gradiente), borda de mesa escura,
// sujeira isolada e a assinatura.
function fakePhoto() {
    const width = 600, height = 300;
    const data = new Uint8ClampedArray(width * height * 4);
    const set = (x: number, y: number, v: number, tint = 0) => {
        const i = (y * width + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = Math.min(255, v + tint); data[i + 3] = 255;
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // papel: de 150 (sombra, à esquerda) até 225 (claro, à direita) — nunca branco puro
            set(x, y, Math.round(150 + (75 * x) / width));
        }
    }
    // borda da mesa: faixa escura na lateral esquerda, de cima a baixo
    for (let y = 0; y < height; y++) for (let x = 0; x < 25; x++) set(x, y, 45);
    // sujeira isolada
    set(560, 30, 60);
    // "assinatura": traços em caneta azul entre x 180-420, y 120-180
    for (let x = 180; x <= 420; x++) {
        const y = Math.round(150 + 25 * Math.sin(x / 15));
        for (let t = -2; t <= 2; t++) set(x, y + t, 50, 60);
    }
    return { width, height, data, colorSpace: 'srgb' } as ImageData;
}

describe('extractInk (foto da assinatura)', () => {
    it('recorta só a assinatura, ignorando sombra, borda da mesa e sujeira', () => {
        const img = fakePhoto();
        const box = extractInk(img)!;
        expect(box).not.toBeNull();
        // Recorte justo em volta do traço (x 180-420, y ~123-177), com tolerância pequena
        expect(box.x).toBeGreaterThanOrEqual(170);
        expect(box.x + box.w).toBeLessThanOrEqual(432);
        expect(box.y).toBeGreaterThanOrEqual(115);
        expect(box.y + box.h).toBeLessThanOrEqual(185);
    });

    it('fundo vira transparente e o traço fica opaco', () => {
        const img = fakePhoto();
        extractInk(img);
        const alphaAt = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
        expect(alphaAt(500, 250)).toBe(0); // papel claro
        expect(alphaAt(60, 250)).toBe(0); // papel na sombra
        expect(alphaAt(10, 150)).toBe(0); // mesa
        expect(alphaAt(300, Math.round(150 + 25 * Math.sin(300 / 15)))).toBeGreaterThan(150); // traço
    });

    it('mantém a parte da assinatura que está em sombra forte', () => {
        const img = fakePhoto();
        // Sombra pesada sobre o começo da assinatura: papel cai para ~100
        for (let y = 0; y < img.height; y++) {
            for (let x = 150; x < 260; x++) {
                const i = (y * img.width + x) * 4;
                for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * 0.6);
            }
        }
        const box = extractInk(img)!;
        expect(box.x).toBeLessThanOrEqual(185); // o começo do traço (x=180) não foi cortado
        expect(box.x + box.w).toBeGreaterThanOrEqual(415);
    });

    it('imagem sem assinatura retorna null', () => {
        const width = 100, height = 50;
        const data = new Uint8ClampedArray(width * height * 4).fill(200);
        expect(extractInk({ width, height, data, colorSpace: 'srgb' } as ImageData)).toBeNull();
    });
});

describe('findOpaqueBox (assinatura desenhada)', () => {
    it('encontra o retângulo do que foi desenhado', () => {
        const width = 50, height = 20;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let x = 10; x <= 30; x++) data[(8 * width + x) * 4 + 3] = 255;
        expect(findOpaqueBox({ width, height, data, colorSpace: 'srgb' } as ImageData))
            .toEqual({ x: 10, y: 8, w: 21, h: 1 });
    });
});
