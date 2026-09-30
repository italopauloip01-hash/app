/**
 * Processamento de imagem da assinatura.
 *
 * Foto de papel tirada no celular não tem fundo branco puro: tem sombra, papel
 * acinzentado e luz irregular. Por isso o fundo é detectado localmente: cada pixel é
 * comparado com a média da vizinhança (limiar adaptativo). Só o que é bem mais escuro
 * que o papel ao redor vira tinta; o resto fica transparente.
 */

const MAX_SIDE = 1200; // reduz fotos grandes: mais rápido e não pesa nas configurações sincronizadas

export interface Box { x: number; y: number; w: number; h: number }

interface InkOptions {
    /** Quanto mais escuro que a vizinhança o pixel precisa ser (0-255) */
    contrast?: number;
}

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Converte a imagem para "só a tinta": fundo transparente, traço com opacidade
 * proporcional ao contraste (bordas suaves). Retorna o retângulo que contém a tinta.
 */
export function extractInk(image: ImageData, { contrast = 25 }: InkOptions = {}): Box | null {
    const { width: w, height: h, data } = image;

    // Luminância + imagem integral para calcular médias locais em O(1)
    const lum = new Float32Array(w * h);
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            // Pixel transparente conta como papel
            const l = data[i + 3] < 30 ? 255 : luminance(data[i], data[i + 1], data[i + 2]);
            lum[y * w + x] = l;
            rowSum += l;
            integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
        }
    }

    // Janela grande o bastante para "ver" o papel em volta de um traço grosso
    const radius = Math.max(8, Math.round(Math.min(w, h) / 12));

    // Brilho típico do papel (percentil 90). Onde a vizinhança é muito mais escura que isso,
    // não é papel (mesa escura) e nada ali conta como tinta. Margem larga: papel na sombra
    // chega a ficar bem mais escuro que o papel claro e ainda precisa ser aceito.
    const sorted = Float32Array.from(lum).sort();
    const paperLevel = sorted[Math.floor(sorted.length * 0.9)];
    const minLocalMean = paperLevel * 0.5;

    // Cor média da tinta, para pintar o traço de forma uniforme
    let inkR = 0, inkG = 0, inkB = 0, inkCount = 0;
    const alpha = new Uint8ClampedArray(w * h);
    const rowInk = new Uint32Array(h);
    const colInk = new Uint32Array(w);

    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
            const area = (x1 - x0) * (y1 - y0);
            const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1]
                - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
            const localMean = sum / area;
            const diff = localMean - lum[y * w + x];
            if (diff <= contrast || localMean < minLocalMean) continue;

            // Transição suave entre o limiar e o traço bem escuro
            alpha[y * w + x] = Math.min(255, Math.round(((diff - contrast) / 30) * 255 + 60));
        }
    }

    removeNoise(alpha, w, h);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!alpha[y * w + x]) continue;
            rowInk[y]++;
            colInk[x]++;
            const i = (y * w + x) * 4;
            inkR += data[i]; inkG += data[i + 1]; inkB += data[i + 2]; inkCount++;
        }
    }

    if (inkCount === 0) return null;

    // Ignora sujeiras isoladas: linhas/colunas com pouquíssima tinta não entram no recorte
    const minRow = Math.max(1, Math.round(w * 0.004));
    const minCol = Math.max(1, Math.round(h * 0.004));
    let top = 0, bottom = h - 1, left = 0, right = w - 1;
    while (top < h && rowInk[top] < minRow) top++;
    while (bottom > top && rowInk[bottom] < minRow) bottom--;
    while (left < w && colInk[left] < minCol) left++;
    while (right > left && colInk[right] < minCol) right--;
    if (top >= h || left >= w) return null;

    // Traço escurecido um pouco (caneta clara no papel costuma sair desbotada na foto)
    const darken = 0.6;
    const r = Math.round((inkR / inkCount) * darken);
    const g = Math.round((inkG / inkCount) * darken);
    const b = Math.round((inkB / inkCount) * darken);

    for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
        data[i + 3] = alpha[p];
    }

    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/**
 * Remove o que não é assinatura:
 * - pontinhos de sujeira (bem menores que um pingo de "i");
 * - manchas encostadas na borda da foto que se estendem por mais da metade dela
 *   (borda de mesa, dobra do papel).
 */
function removeNoise(alpha: Uint8ClampedArray, w: number, h: number) {
    const minArea = Math.max(4, Math.round(w * h * 0.00001));
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let start = 0; start < w * h; start++) {
        if (!alpha[start] || seen[start]) continue;

        // Flood fill (8 vizinhos) do componente
        const pixels: number[] = [];
        let minX = w, maxX = 0, minY = h, maxY = 0;
        stack.push(start);
        seen[start] = 1;
        while (stack.length) {
            const p = stack.pop()!;
            pixels.push(p);
            const x = p % w, y = (p - x) / w;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const n = ny * w + nx;
                    if (alpha[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
                }
            }
        }

        const touchesBorder = minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1;
        const spansSide = (maxX - minX + 1) > w * 0.5 || (maxY - minY + 1) > h * 0.5;
        if (pixels.length < minArea || (touchesBorder && spansSide)) for (const p of pixels) alpha[p] = 0;
    }
}

/** Retângulo com pixels visíveis (para recortar o que foi desenhado no canvas). */
export function findOpaqueBox(image: ImageData): Box | null {
    const { width: w, height: h, data } = image;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Recorta o canvas no retângulo, com margem, e devolve PNG transparente. */
export function cropToDataUrl(source: HTMLCanvasElement, box: Box, padding = 12): string {
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const w = Math.min(source.width - x, box.w + padding * 2);
    const h = Math.min(source.height - y, box.h + padding * 2);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h);
    return out.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Não foi possível abrir a imagem'));
        img.src = src;
    });
}

/** Foto da assinatura no papel -> PNG transparente só com o traço, recortado. */
export async function processSignaturePhoto(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const img = await loadImage(url);
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const box = extractInk(image);
        if (!box) throw new Error('Não foi encontrada nenhuma assinatura na imagem. Tente uma foto com mais contraste.');
        ctx.putImageData(image, 0, 0);
        return cropToDataUrl(canvas, box);
    } finally {
        URL.revokeObjectURL(url);
    }
}
