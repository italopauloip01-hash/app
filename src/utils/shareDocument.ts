import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { applyPrintColors } from './pdfUtils';
import { formatWhatsAppNumber } from './phoneUtils';

/**
 * Gera a imagem (JPEG) de um documento (extrato, recibo, orçamento) a partir do elemento
 * com o id dado. Usa uma cópia de 800px fora da tela, para não depender do tamanho em
 * que o documento aparece na prévia.
 */
export async function renderDocumentImage(elementId: string): Promise<string> {
    const original = document.getElementById(elementId);
    if (!original) throw new Error('Conteúdo do documento não encontrado.');

    const clone = original.cloneNode(true) as HTMLElement;
    clone.id = `${elementId}-clone`;
    clone.className = clone.className.replace(/w-full|max-w-\[21cm\]/g, '');
    Object.assign(clone.style, {
        width: '800px', minWidth: '800px', maxWidth: '800px',
        position: 'absolute', top: '-9999px', left: '-9999px',
    });
    document.body.appendChild(clone);
    try {
        await new Promise(resolve => setTimeout(resolve, 300)); // deixa o navegador refazer o layout
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 800,
            width: 800,
            onclone: (clonedDoc) => applyPrintColors(clonedDoc),
        });
        return canvas.toDataURL('image/jpeg', 0.95);
    } finally {
        clone.remove();
    }
}

const isCancel = (err: unknown) => {
    const e = err as { name?: string; message?: string } | null;
    return e?.name === 'AbortError' || /cancel/i.test(e?.message ?? '');
};

function dataUrlToFile(dataUrl: string, fileName: string): File {
    const [header, base64] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg';
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return new File([bytes], fileName, { type: mime });
}

async function writeNativeFile(dataUrl: string, fileName: string): Promise<string> {
    const result = await Filesystem.writeFile({
        path: fileName,
        data: dataUrl.split(',')[1],
        directory: Directory.Cache,
    });
    // O Android precisa de um instante para registrar o arquivo antes de compartilhar
    await new Promise(resolve => setTimeout(resolve, 300));
    return result.uri;
}

function download(dataUrl: string, fileName: string) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
}

/** "Salvar imagem": compartilha só o arquivo (celular) ou baixa (computador). */
export async function saveDocumentImage(dataUrl: string, fileName: string, title: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        const uri = await writeNativeFile(dataUrl, fileName);
        try {
            await Share.share({ title, files: [uri], dialogTitle: title });
        } catch (err) {
            if (!isCancel(err)) throw err;
        }
        return;
    }
    download(dataUrl, fileName);
}

export type SendResult = 'shared' | 'canceled' | 'fallback';

/**
 * Envia a imagem e o texto juntos pelo compartilhamento do celular: no WhatsApp a foto
 * chega com o texto como legenda, numa mensagem só. O texto também vai para a área de
 * transferência, caso o app escolhido não aceite legenda (dá para colar).
 *
 * Sem compartilhamento de arquivos (ex.: navegador do computador), baixa a imagem e
 * abre o WhatsApp com o texto pronto ('fallback'): aí é só anexar a imagem baixada.
 */
export async function sendImageWithText(opts: {
    dataUrl: string;
    fileName: string;
    text: string;
    title: string;
    phone?: string;
}): Promise<SendResult> {
    const { dataUrl, fileName, text, title, phone } = opts;
    try {
        await navigator.clipboard?.writeText(text);
    } catch { /* sem permissão de área de transferência: segue sem copiar */ }

    try {
        if (Capacitor.isNativePlatform()) {
            const uri = await writeNativeFile(dataUrl, fileName);
            await Share.share({ title, text, files: [uri], dialogTitle: 'Enviar pelo WhatsApp' });
            return 'shared';
        }
        const file = dataUrlToFile(dataUrl, fileName);
        if (navigator.canShare?.({ files: [file], text })) {
            await navigator.share({ files: [file], text, title });
            return 'shared';
        }
    } catch (err) {
        if (isCancel(err)) return 'canceled';
        throw err;
    }

    download(dataUrl, fileName);
    const number = phone ? formatWhatsAppNumber(phone) : '';
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank');
    return 'fallback';
}
