import { useState } from 'react';
import { toError } from '../lib/utils';
import { renderDocumentImage, saveDocumentImage, sendImageWithText } from '../utils/shareDocument';

type Busy = null | 'image' | 'whatsapp';

/**
 * Ações de um documento (extrato, recibo, orçamento): salvar a imagem, ou enviar imagem +
 * texto pelo WhatsApp. `busy` indica o que está sendo gerado, para mostrar no botão.
 */
export function useDocumentShare(elementId: string, fileName: string, title: string) {
    const [busy, setBusy] = useState<Busy>(null);

    const run = async (kind: Exclude<Busy, null>, action: (dataUrl: string) => Promise<void>) => {
        if (busy) return;
        setBusy(kind);
        try {
            await action(await renderDocumentImage(elementId));
        } catch (caught) {
            const error = toError(caught);
            console.error('Falha ao gerar/compartilhar documento:', error);
            alert(`Não foi possível gerar a imagem: ${error.message || 'tente novamente.'}`);
        } finally {
            setBusy(null);
        }
    };

    const saveImage = () => run('image', dataUrl => saveDocumentImage(dataUrl, fileName, title));

    const sendWhatsApp = (text: string, phone?: string) => run('whatsapp', async dataUrl => {
        const result = await sendImageWithText({ dataUrl, fileName, text, title, phone });
        if (result === 'fallback') {
            alert('A imagem foi baixada e o WhatsApp abriu com o texto pronto. Anexe a imagem na conversa antes de enviar.');
        }
    });

    return { busy, saveImage, sendWhatsApp };
}
