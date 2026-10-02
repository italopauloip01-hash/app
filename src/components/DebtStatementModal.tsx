import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { Capacitor } from '@capacitor/core';
import { DocumentPreview } from './DocumentPreview';
import { toError } from '../lib/utils';
import { X, FileText, Share2, Image } from 'lucide-react';
import type { Client, Service } from '../types';
import { format } from 'date-fns';
import { useSettings, DEFAULT_COMPANY_NAME } from '../hooks/useData';
import { generatePixPayload } from '../utils/PixUtils';

import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { applyPrintColors } from '../utils/pdfUtils';
import { formatLocalDate, getServicePrice, parseMonetaryValue, parseLocalDate, formatCurrency } from '../utils/dateUtils';

interface DebtStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: Client;
    pendingServices: Service[];
}

export function DebtStatementModal({ isOpen, onClose, client, pendingServices }: DebtStatementModalProps) {
    useLockBodyScroll(isOpen);
    const settings = useSettings();
    const companyName = settings?.name?.trim() || DEFAULT_COMPANY_NAME;
    const pixKey = settings?.pixKey || '';

    // Sort pending services by date ascending
    const sortedPendingServices = [...pendingServices].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());

    const totalDebt = sortedPendingServices.reduce((acc, curr) => acc + getServicePrice(curr), 0);
    const pixData = pixKey ? generatePixPayload(pixKey, totalDebt, companyName) : null;

    if (!isOpen) return null;

    const handleGeneratePhoto = async () => {
        const originalElement = document.getElementById('statement-printable');
        if (!originalElement) {
            alert("Erro interno: Conteúdo do extrato não encontrado.");
            return;
        }

        const fileName = `extrato-${client.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.jpg`;

        try {
            console.log("Gerando imagem de extrato...");

            // 1. Criar um clone DOM Real temporário off-screen para forçar o layout 800px Premium
            const clone = originalElement.cloneNode(true) as HTMLElement;
            clone.id = 'statement-printable-clone';

            // Remover as classes responsivas que o usuário vê na tela
            clone.className = clone.className.replace(/w-full|max-w-\[21cm\]/g, '');

            // Forçar o layout fixo absoluto para o navegador calcular (Reflow perfeito)
            clone.style.width = '800px';
            clone.style.minWidth = '800px';
            clone.style.maxWidth = '800px';
            clone.style.position = 'absolute';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';

            // Anexar no body invisível
            document.body.appendChild(clone);

            // Permitir que o navegador recalcule a árvore (Text Wrap)
            await new Promise(resolve => setTimeout(resolve, 300));

            // Capturar
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(clone, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 800,
                width: 800,
                onclone: (clonedDoc) => {
                    applyPrintColors(clonedDoc);
                }
            });

            // Limpar o DOM
            document.body.removeChild(clone);

            const base64Uri = canvas.toDataURL('image/jpeg', 0.95);

            if (Capacitor.isNativePlatform()) {
                const base64Data = base64Uri.split(',')[1] || base64Uri.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                await new Promise(resolve => setTimeout(resolve, 300));

                try {
                    await Share.share({
                        title: 'Extrato de Débitos - AirTech Pro',
                        text: `Extrato de débitos - ${client.name}`,
                        url: result.uri,
                        dialogTitle: 'Compartilhar Extrato'
                    });
                } catch (caught) {
                    const shareError = toError(caught);
                    if (shareError.message && shareError.message.includes('canceled')) {
                        console.log("Compartilhamento cancelado pelo usuário.");
                        return;
                    }
                    throw shareError;
                }
            } else {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = base64Uri;
                link.click();
            }
        } catch (caught) {
            const error = toError(caught);
            console.error("Erro detalhado ao gerar extrato Imagem:", error);
            if (error.message && error.message.includes('canceled')) return;
            alert(`Falha no extrato: ${error.message || "Tente novamente."}`);
        }
    };

    const handleShare = () => {
        let text = `*EXTRATO DE DÉBITOS - ${companyName.toUpperCase()}*\n\n` +
            `*Cliente:* ${client.name}\n` +
            `*Valor Total em Aberto:* ${formatCurrency((Number(totalDebt) || 0))}\n\n` +
            `*SERVIÇOS PENDENTES:*\n`;

        sortedPendingServices.forEach((service, index) => {
            text += `${index + 1}. ${formatLocalDate(service.date)} - ${service.type}${service.description ? ' - ' + service.description : ''} (${formatCurrency(getServicePrice(service))})\n`;
        });

        if (pixData && totalDebt > 0) {
            text += `\n*Pagamento via Pix:*\n${pixData.copyAndPaste}\n\n`;
        }

        text += `\nSegue em anexo o comprovante detalhado.`;

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:bg-white print:p-0">
            <div className="dark:bg-slate-900 dark:border-slate-800 bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-scale-in border border-white/20 max-h-[94vh]">
                {/* Modal Header */}
                <div className="dark:bg-slate-900 dark:border-slate-800 px-6 py-5 border-b border-slate-100 flex flex-row items-center justify-between bg-white z-10 w-full relative shrink-0">
                    <h2 className="dark:text-white text-lg font-bold text-slate-800 flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <FileText size={16} />
                        </div>
                        Gerar Extrato
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Pré-visualização: é o próprio documento que vira a imagem */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-600 truncate"><strong>{client.name}</strong> · {sortedPendingServices.length} serviço(s)</p><span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700">{formatCurrency(totalDebt)} a receber</span></div>
                    <DocumentPreview>

                <div id="statement-printable" className="forced-light bg-white p-10 flex flex-col min-h-[1131px] w-[800px] min-w-[800px]" style={{ transform: 'none' }}>
                    <div className="flex justify-between items-end pb-6 border-b-[2px] border-slate-300">
                        <div>
                            <h1 className="text-[32px] font-black text-[#0f172a] tracking-tight uppercase leading-none">{companyName}</h1>
                            <p className="text-[#2563eb] font-bold text-[13px] tracking-widest uppercase mt-2">Extrato de Serviços Requeridos</p>
                        </div>
                        <div className="text-right">
                            <p className="font-black text-[22px] text-[#0f172a] tracking-wider uppercase leading-none">EXTRATO DE DÉBITOS</p>
                            <p className="text-slate-400 text-[11px] mt-2 font-mono">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                    </div>

                    <div className="mt-8 bg-slate-50 border border-slate-200 p-6 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">DADOS DO CLIENTE</p>
                        <h2 className="text-xl font-bold text-slate-900">{client.name}</h2>
                        <div className="mt-2 text-slate-600 text-sm grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-slate-400 font-medium mr-1">Endereço:</span>
                                {client.address || "Não informado"}
                            </div>
                            <div>
                                <span className="text-slate-400 font-medium mr-1">Telefone:</span>
                                {client.phone}
                            </div>
                        </div>
                    </div>

                    <div className="mt-10">
                        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-widest mb-4 border-b pb-2 border-slate-200">
                            RESUMO DOS SERVIÇOS PENDENTES
                        </h3>

                        <div className="flex justify-between border-b-[2px] border-slate-200 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <div className="w-24">DATA</div>
                            <div className="flex-1">SERVIÇO / APARELHO</div>
                            <div className="w-32 text-right">VALOR</div>
                        </div>

                        <div className="space-y-0 text-sm">
                            {sortedPendingServices.map(service => (
                                <div key={service.id} className="border-b border-slate-100">
                                    <div className="flex justify-between py-4 items-start bg-slate-50/30 px-2 rounded-lg">
                                        <div className="w-24 font-bold text-slate-800">{formatLocalDate(service.date)}</div>
                                        <div className="flex-1 font-bold text-slate-800 uppercase text-[11px] tracking-wider">
                                            Serviço Realizado
                                        </div>
                                        <div className="w-32 text-right font-black text-slate-900">{formatCurrency(getServicePrice(service))}</div>
                                    </div>

                                    {/* Detailed Items for this service */}
                                    <div className="pl-24 pr-2 pb-3 space-y-1">
                                        {service.items && service.items.length > 0 ? (
                                            service.items.map((item, idx) => {
                                                const quantity = Number(item.quantity) || 1;
                                                const price = parseMonetaryValue(item.price);
                                                return (
                                                    <div key={idx} className="flex justify-between text-[11px] text-slate-500 border-l border-slate-200 pl-3 py-0.5">
                                                        <div className="flex-1 text-slate-700">
                                                            <span className="font-bold">{quantity}x {item.type}{quantity > 1 ? ` (${formatCurrency(price)}/un)` : ''}</span>
                                                            {item.description && <span className="text-slate-500 ml-1">- {item.description}</span>}
                                                        </div>
                                                        <div className="w-24 text-right">{formatCurrency((price * quantity))}</div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="flex justify-between text-[11px] text-slate-500 border-l border-slate-200 pl-3">
                                                <div className="flex-1 text-slate-700">
                                                    <span className="font-bold">1x {service.type}</span>
                                                    {service.description && <span className="text-slate-500 ml-1">- {service.description}</span>}
                                                </div>
                                                <div className="w-24 text-right">{formatCurrency(getServicePrice(service))}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {sortedPendingServices.length === 0 && (
                                <div className="py-8 text-center text-slate-500 italic">
                                    Nenhum serviço pendente encontrado para este cliente.
                                </div>
                            )}
                        </div>

                        <div className="mt-8 flex justify-end items-center gap-12 text-right">
                            <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                                VALOR TOTAL EM ABERTO:
                            </span>
                            <span className="text-[32px] font-black text-[#dc2626]">{formatCurrency((Number(totalDebt) || 0))}</span>
                        </div>
                    </div>

                    {pixData && totalDebt > 0 && (
                        <div className="mt-10 bg-[#f8fafc] border border-blue-100 rounded-xl p-6 flex items-start gap-6">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                <img src={pixData.qrCodeUrl} alt="QR Code Pix" className="w-32 h-32" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-sm">Pague via PIX</h4>
                                <p className="text-slate-500 text-xs mb-4">Aponte a câmera do celular para o QR Code ao lado ou utilize a chave abaixo.</p>

                                <div className="bg-white border border-slate-200 p-3 rounded-lg">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">CHAVE PIX</p>
                                    <p className="font-mono text-slate-800 font-bold">{pixKey}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">Beneficiário: {companyName}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-h-[80px]"></div>

                    <div className="mt-auto pt-8 border-t border-slate-200">
                        <div className="text-center">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                ESTE DOCUMENTO É UM EXTRATO DE DÉBITOS GERADO POR {companyName?.toUpperCase() || ''}
                            </p>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                        @media print {
                            body { visibility: hidden; }
                            #statement-printable, #statement-printable * { visibility: visible; }
                            #statement-printable { 
                                position: absolute; 
                                left: 0; 
                                top: 0; 
                                width: 100%;
                                padding: 0 !important;
                                margin: 0 !important;
                            }
                            .no-print { display: none !important; }
                        }
                    `}} />
                    </DocumentPreview>
                </div>

                {/* Footer Buttons */}
                <div className="dark:bg-slate-900 dark:border-slate-800 p-5 border-t border-slate-100 bg-white flex flex-row gap-3 z-10 w-full shrink-0">
                    <button
                        onClick={handleGeneratePhoto}
                        className="flex-1 py-3.5 bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base border border-slate-200"
                    >
                        <Image size={18} className="text-slate-500" />
                        <span>Salvar Imagem</span>
                    </button>

                    <button
                        onClick={handleShare}
                        className="flex-1 py-3.5 bg-[#25D366] text-white rounded-xl font-bold shadow-lg shadow-green-500/20 hover:bg-[#1ebd5a] transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                        <Share2 size={18} />
                        <span>Enviar WhatsApp</span>
                    </button>
                </div>
            </div>

        </div >
    );
}
