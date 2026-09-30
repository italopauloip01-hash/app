import { Capacitor } from '@capacitor/core';
import { toError } from '../lib/utils';
import { X, Share2, Image, FileText } from 'lucide-react';
import type { Client, Service } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettings } from '../hooks/useData';
import { generatePixPayload } from '../utils/PixUtils';
import { formatWhatsAppNumber } from '../utils/phoneUtils';

import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';
import { applyPrintColors } from '../utils/pdfUtils';
import { parseLocalDate, formatLocalDate, getServicePrice, parseMonetaryValue } from '../utils/dateUtils';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: Service;
    client: Client;
}

export function ReceiptModal({ isOpen, onClose, service, client }: ReceiptModalProps) {
    const settings = useSettings();
    const companyName = settings?.name || 'FrioTech Soluções';
    const pixKey = settings?.pixKey || '';

    const pixData = pixKey ? generatePixPayload(pixKey, Number(service.price) || 0, companyName) : null;

    if (!isOpen) return null;


    const handleShare = () => {
        let text = `*RECIBO DE SERVIÇO - ${companyName.toUpperCase()}*\n\n` +
            `*Cliente:* ${client.name}\n` +
            `*Data:* ${formatLocalDate(service.date)}\n` +
            `*Valor:* R$ ${getServicePrice(service).toFixed(2)}\n` +
            `*Status:* ${service.paymentStatus === 'Pago' ? 'PAGAMENTO OK (' + service.paymentMethod + ')' : 'PAGAMENTO PENDENTE'}\n\n` +
            `*DETALHES DO SERVIÇO:*\n`;

        if (service.items && service.items.length > 0) {
            service.items.forEach((item, index) => {
                const price = parseMonetaryValue(item.price);
                const quantity = Number(item.quantity) || 1;

                if (quantity > 1) {
                    text += `${index + 1}. ${quantity}x ${item.type} (R$ ${price.toFixed(2)}/un)${item.description ? ' - ' + item.description : ''} - R$ ${(price * quantity).toFixed(2)}\n`;
                } else {
                    text += `${index + 1}. ${quantity}x ${item.type}${item.description ? ' - ' + item.description : ''} - R$ ${(price * quantity).toFixed(2)}\n`;
                }
            });
        } else {
            const servicePrice = getServicePrice(service);
            text += `1. 1x ${service.type}${service.description ? ' - ' + service.description : ''} - R$ ${servicePrice.toFixed(2)}\n`;
        }

        if (service.paymentStatus === 'Pendente' && pixData) {
            text += `\n*Pagamento via Pix:*\n${pixData.copyAndPaste}\n\n`;
        }

        text += `\nObrigado pela preferência!`;

        const url = `https://wa.me/${formatWhatsAppNumber(client.phone)}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleGeneratePhoto = async () => {
        const originalElement = document.getElementById('receipt-content');
        if (!originalElement) {
            alert("Erro interno: Conteúdo do recibo não encontrado.");
            return;
        }

        const fileName = `recibo-${client.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.jpg`;

        try {
            console.log("Iniciando geração de imagem...");

            // 1. Criar um clone DOM Real temporário off-screen para forçar o layout 800px Premium 
            // sem que os botões ou o flex nativo quebrem o html2canvas.
            const clone = originalElement.cloneNode(true) as HTMLElement;
            clone.id = 'receipt-content-clone';

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
                // Ensure pure base64 without data headers to avoid corrupt files
                const base64Data = base64Uri.split(',')[1] || base64Uri.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                // Pequeno delay para garantir que o sistema Android registre o arquivo no cache físico antes de tentar compartilhar.
                await new Promise(resolve => setTimeout(resolve, 300));

                try {
                    await Share.share({
                        title: 'Recibo - AirTech Pro',
                        text: `Recibo de serviço - ${client.name}`,
                        url: result.uri,
                        dialogTitle: 'Compartilhar Recibo'
                    });
                } catch (caught) {
                    const shareError = toError(caught);
                    if (shareError.message && shareError.message.includes('canceled')) {
                        console.log("Compartilhamento cancelado pelo usuário.");
                        return; // Não exibir alerta vermelho na tela se o usuário apenas fechou a gaveta de share.
                    }
                    throw shareError;
                }
            } else {
                // Web fallback
                const link = document.createElement('a');
                link.download = fileName;
                link.href = base64Uri;
                link.click();
            }
        } catch (caught) {
            const error = toError(caught);
            console.error("Erro detalhado ao gerar/compartilhar Imagem:", error);

            // Ignorar display de erro se foi apenas um cancelamento de share acidental não capturado no try interno
            if (error.message && error.message.includes('canceled')) return;

            alert(`Erro ao gerar Imagem: ${error.message || "Tente novamente."}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:bg-white print:p-0">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:w-full relative">

                {/* Modal Header FIXO */}
                <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-white print:hidden flex-shrink-0 z-10 w-full">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 text-blue-600 truncate">
                        Visualizar Recibo
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleShare}
                            className="p-2.5 text-green-600 hover:bg-green-50 rounded-xl transition-colors flex items-center gap-2 font-bold text-sm"
                            title="Compartilhar via WhatsApp"
                        >
                            <Share2 size={18} />
                            <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                        <button
                            onClick={handleGeneratePhoto}
                            className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-2 font-bold text-sm"
                            title="Salvar como Foto (Imagem)"
                        >
                            <Image size={18} />
                            <span className="hidden sm:inline">Salvar Foto</span>
                        </button>
                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Modal View Simples sem preview poluindo a tela */}
                <div className="flex-1 p-8 sm:p-12 flex flex-col items-center justify-center bg-slate-50 text-center">
                    <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-sm">
                        <FileText size={48} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Recibo Pronto</h3>
                    <p className="text-slate-500 max-w-sm text-sm sm:text-base leading-relaxed">
                        O recibo para <strong>{client.name}</strong> foi gerado e está pronto para ser salvo ou compartilhado.
                    </p>
                </div>

                {/* Container oculto para o html2canvas (fora da tela) */}
                <div className="absolute top-[-9999px] left-[-9999px] opacity-0 pointer-events-none overflow-hidden">
                    {/* O Documento Centralizado com tamanho fixo perfeito de Papel */}
                    <div id="receipt-content" className="bg-white p-10 flex flex-col min-h-[1131px] w-[800px] min-w-[800px]" style={{ transform: 'none' }}>

                        {/* Header */}
                        <div className="flex justify-between items-end pb-6 border-b-2 border-slate-400">
                            <div>
                                <h1 className="text-[32px] font-black text-[#0f172a] tracking-tight uppercase leading-none">{companyName}</h1>
                                <p className="text-[#2563eb] font-bold text-[13px] tracking-widest uppercase mt-2">Recibo de Prestação de Serviço</p>
                            </div>
                            <div className="text-right">
                                <p className="font-black text-[22px] text-[#0f172a] tracking-wider uppercase leading-none">RECIBO</p>
                                <p className="text-slate-400 text-[11px] mt-2 font-mono">#{service.id}</p>
                            </div>
                        </div>

                        {/* Client Info Bar */}
                        <div className="mt-8 flex justify-between items-start">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">CLIENTE</p>
                                <h2 className="text-lg font-bold text-slate-900 leading-tight">{client.name}</h2>
                                <p className="text-slate-500 text-sm mt-1">{client.address ? `- ${client.address}` : "- Endereço não informado"}</p>
                                <p className="text-slate-500 text-sm">{client.phone}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">DATA DO SERVIÇO</p>
                                <p className="font-bold text-slate-800 text-base">
                                    {format(parseLocalDate(service.date), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                </p>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="mt-12">
                            <div className="flex justify-between border-b-2 border-slate-200 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <div className="w-16">QTD</div>
                                <div className="flex-1">DESCRIÇÃO DO SERVIÇO</div>
                                <div className="w-32 text-right">VALOR UNIT.</div>
                                <div className="w-32 text-right">TOTAL</div>
                            </div>

                            <div className="space-y-0 text-sm">
                                {service.items && service.items.length > 0 ? (
                                    service.items.map((item, idx) => {
                                        const price = parseMonetaryValue(item.price);
                                        const quantity = Number(item.quantity) || 1;
                                        return (
                                            <div key={idx} className="flex justify-between py-4 border-b border-slate-100 items-start">
                                                <div className="w-16 font-bold text-slate-800">{quantity}x</div>
                                                <div className="flex-1 text-slate-800">
                                                    <span className="font-bold">{item.type}</span>
                                                    {item.description && <span className="text-slate-500 ml-1">- {item.description}</span>}
                                                </div>
                                                <div className="w-32 text-right text-slate-500 font-medium">{quantity > 1 ? `R$ ${price.toFixed(2)}` : '-'}</div>
                                                <div className="w-32 text-right font-bold text-slate-900">R$ {(price * quantity).toFixed(2)}</div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="flex justify-between py-4 border-b border-slate-100 items-start">
                                        <div className="w-16 font-bold text-slate-800">1x</div>
                                        <div className="flex-1 text-slate-800">
                                            <span className="font-bold">{service.type}</span>
                                            {service.description && <span className="text-slate-500 ml-1">- {service.description}</span>}
                                        </div>
                                        <div className="w-32 text-right font-medium text-slate-500">-</div>
                                        <div className="w-32 text-right font-bold text-slate-900">R$ {getServicePrice(service).toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            {/* Total Area */}
                            <div className="mt-8 flex justify-end items-center gap-12 text-right">
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                                    {service.paymentStatus === 'Pago' ? 'VALOR TOTAL PAGO:' : 'VALOR TOTAL EM ABERTO:'}
                                </span>
                                <span className="text-[28px] font-black text-[#0f172a]">R$ {getServicePrice(service).toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1 min-h-[120px]"></div>

                        {/* Footer */}
                        <div className="mt-auto pt-8 flex justify-between items-end">
                            {/* Left Side: Next Maintenance & Disclaimer */}
                            <div>
                                <div className="bg-[#f8fafc] rounded-[10px] p-5 border border-slate-100 min-w-[320px] mb-3">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">PRÓXIMA MANUTENÇÃO</p>
                                    <p className="font-bold text-slate-800 text-base">
                                        {service.nextServiceDate
                                            ? format(parseLocalDate(service.nextServiceDate), "dd 'de' MMMM, yyyy", { locale: ptBR })
                                            : "Não agendada"}
                                    </p>
                                </div>
                                <div className="text-[9px] text-slate-400 italic">
                                    * Recibo gerado digitalmente via FrioTech Soluções.
                                </div>
                            </div>

                            {/* Right Side: Signature */}
                            <div className="text-center w-[280px]">
                                {settings?.signature ? (
                                    <img src={settings.signature} alt="Assinatura" className="h-16 mx-auto mb-2 object-contain" />
                                ) : (
                                    <div className="h-16"></div>
                                )}
                                <div className="border-b-2 border-slate-400 mb-2"></div>
                                <p className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">ASSINATURA DO TÉCNICO</p>
                                {settings?.ownerName && <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">{settings.ownerName}</p>}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Print Styles */}
                <style dangerouslySetInnerHTML={{
                    __html: `
                        @media print {
                            body { visibility: hidden; }
                            #receipt-content, #receipt-content * { visibility: visible; }
                            #receipt-content {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 100%;
                                padding: 0;
                                margin: 0;
                            }
                            .no-print { display: none !important; }
                        }
                    `}} />

                {/* Footer Buttons FIXOS */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-row gap-3 no-print flex-shrink-0 z-10 w-full">
                    <button
                        onClick={onClose}
                        className="flex-[1] py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-95 text-center text-sm sm:text-base"
                    >
                        Fechar
                    </button>
                    <button
                        onClick={handleGeneratePhoto}
                        className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-sm sm:text-base"
                    >
                        <Image size={18} />
                        <span className="whitespace-nowrap">Salvar Foto</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
