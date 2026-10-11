import { useState } from 'react';
import { useDocumentShare } from '../hooks/useDocumentShare';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { DocumentPreview } from './DocumentPreview';
import { X, Share2, Image, Copy, Check } from 'lucide-react';
import type { Client, Service } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettings, DEFAULT_COMPANY_NAME } from '../hooks/useData';
import { generatePixPayload, openPixWhatsApp, copyPixCode } from '../utils/PixUtils';
import { PixPromptModal } from './PixPromptModal';

import { parseLocalDate, formatLocalDate, getServicePrice, parseMonetaryValue, formatCurrency } from '../utils/dateUtils';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: Service;
    client: Client;
}

export function ReceiptModal({ isOpen, onClose, service, client }: ReceiptModalProps) {
    useLockBodyScroll(isOpen);
    const share = useDocumentShare('receipt-content', `recibo-${client.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.jpg`, 'Recibo');
    const settings = useSettings();
    const companyName = settings?.name?.trim() || DEFAULT_COMPANY_NAME;
    const pixKey = settings?.pixKey || '';
    const [copiedPix, setCopiedPix] = useState(false);
    const [showPixPrompt, setShowPixPrompt] = useState(false);

    const pixData = pixKey ? generatePixPayload(pixKey, Number(service.price) || 0, companyName) : null;

    if (!isOpen) return null;

    const handleSendPixOnly = () => {
        if (!pixData) return;
        openPixWhatsApp(pixData.copyAndPaste, client.phone);
    };

    const handleCopyPix = async () => {
        if (!pixData) return;
        const ok = await copyPixCode(pixData.copyAndPaste);
        if (ok) {
            setCopiedPix(true);
            setTimeout(() => setCopiedPix(false), 2500);
        }
    };

    const handleShare = async () => {
        let text = `*RECIBO DE SERVIÇO - ${companyName.toUpperCase()}*\n\n` +
            `*Cliente:* ${client.name}\n` +
            `*Data:* ${formatLocalDate(service.date)}\n` +
            `*Valor:* ${formatCurrency(getServicePrice(service))}\n` +
            `*Status:* ${service.paymentStatus === 'Pago' ? 'PAGAMENTO OK (' + service.paymentMethod + ')' : 'PAGAMENTO PENDENTE'}\n\n` +
            `*DETALHES DO SERVIÇO:*\n`;

        if (service.items && service.items.length > 0) {
            service.items.forEach((item, index) => {
                const price = parseMonetaryValue(item.price);
                const quantity = Number(item.quantity) || 1;

                if (quantity > 1) {
                    text += `${index + 1}. ${quantity}x ${item.type} (${formatCurrency(price)}/un)${item.description ? ' - ' + item.description : ''} - ${formatCurrency((price * quantity))}\n`;
                } else {
                    text += `${index + 1}. ${quantity}x ${item.type}${item.description ? ' - ' + item.description : ''} - ${formatCurrency((price * quantity))}\n`;
                }
            });
        } else {
            const servicePrice = getServicePrice(service);
            text += `1. 1x ${service.type}${service.description ? ' - ' + service.description : ''} - ${formatCurrency(servicePrice)}\n`;
        }

        if (service.paymentStatus === 'Pendente' && pixData) {
            text += `\n*Pagamento via Pix:*\nChave: ${pixKey}\n_(O código Pix Copia e Cola será enviado a seguir em mensagem separada)_\n\n`;
        }

        text += `\nObrigado pela preferência!`;
        const sent = await share.sendWhatsApp(text, client.phone);
        if (sent && service.paymentStatus === 'Pendente' && pixData) {
            setShowPixPrompt(true);
        }
    };

    const handleGeneratePhoto = share.saveImage;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:bg-white print:p-0">
            <div className="dark:bg-slate-900 bg-white w-full max-w-4xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:w-full relative">

                {/* Modal Header FIXO */}
                <div className="dark:bg-slate-900 dark:border-slate-800 p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-white print:hidden flex-shrink-0 z-10 w-full">
                    <h2 className="dark:text-blue-400 text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 text-blue-600 truncate">
                        Visualizar Recibo
                    </h2>
                    <div className="flex items-center gap-2">
                        {service.paymentStatus === 'Pendente' && pixData && (
                            <button
                                onClick={handleSendPixOnly}
                                className="p-2.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors flex items-center gap-1.5 font-bold text-sm"
                                title="Enviar apenas o código Pix Copia e Cola no WhatsApp para o cliente colar no banco"
                            >
                                <Share2 size={18} />
                                <span className="hidden sm:inline">Pix Separado</span>
                            </button>
                        )}
                        <button
                            onClick={handleShare}
                            className="p-2.5 text-green-600 hover:bg-green-50 rounded-xl transition-colors flex items-center gap-2 font-bold text-sm"
                            title="Compartilhar via WhatsApp"
                        >
                            <Share2 size={18} />
                            <span className="hidden sm:inline">{share.busy === 'whatsapp' ? 'Gerando...' : 'WhatsApp'}</span>
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

                {/* Pré-visualização: é o próprio documento que vira a imagem */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 bg-slate-50 space-y-3">
                    <p className="text-sm text-slate-600 truncate">Recibo de <strong>{client.name}</strong></p>
                    <DocumentPreview>

                    {/* O Documento Centralizado com tamanho fixo perfeito de Papel */}
                    <div id="receipt-content" className="forced-light bg-white p-10 flex flex-col min-h-[1131px] w-[800px] min-w-[800px]" style={{ transform: 'none' }}>

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
                                                <div className="w-32 text-right text-slate-500 font-medium">{quantity > 1 ? `${formatCurrency(price)}` : '-'}</div>
                                                <div className="w-32 text-right font-bold text-slate-900">{formatCurrency((price * quantity))}</div>
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
                                        <div className="w-32 text-right font-bold text-slate-900">{formatCurrency(getServicePrice(service))}</div>
                                    </div>
                                )}
                            </div>

                            {/* Total Area */}
                            <div className="mt-8 flex justify-end items-center gap-12 text-right">
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                                    {service.paymentStatus === 'Pago' ? 'VALOR TOTAL PAGO:' : 'VALOR TOTAL EM ABERTO:'}
                                </span>
                                <span className="text-[28px] font-black text-[#0f172a]">{formatCurrency(getServicePrice(service))}</span>
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
                                    * Recibo gerado digitalmente via {companyName}.
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
                    </DocumentPreview>
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

                {/* Pix Quick Action Bar */}
                {service.paymentStatus === 'Pendente' && pixData && (
                    <div className="dark:bg-slate-800/90 dark:border-slate-800 px-5 py-2.5 bg-emerald-50/80 border-t border-emerald-100 flex items-center justify-between gap-3 text-xs z-10 w-full shrink-0">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium truncate">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
                            <span className="truncate"><strong>Pix Copia e Cola:</strong> pronto para colar no banco</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleCopyPix}
                                className="px-2.5 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                            >
                                {copiedPix ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
                                <span>{copiedPix ? 'Copiado' : 'Copiar'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSendPixOnly}
                                className="px-3 py-1.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                                title="Enviar mensagem separada no WhatsApp contendo apenas o código Pix"
                            >
                                <Share2 size={13} />
                                <span>Enviar Pix Separado</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer Buttons FIXOS */}
                <div className="dark:bg-slate-900 dark:border-slate-800 p-4 border-t border-slate-100 bg-slate-50 flex flex-row gap-3 no-print flex-shrink-0 z-10 w-full">
                    <button
                        onClick={onClose}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 flex-[1] py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-95 text-center text-sm sm:text-base"
                    >
                        Fechar
                    </button>
                    <button
                        onClick={handleGeneratePhoto}
                        className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-sm sm:text-base"
                    >
                        <Image size={18} />
                        <span className="whitespace-nowrap">{share.busy === 'image' ? 'Gerando...' : 'Salvar Foto'}</span>
                    </button>
                </div>
            </div>

            {service.paymentStatus === 'Pendente' && pixData && (
                <PixPromptModal
                    isOpen={showPixPrompt}
                    onClose={() => setShowPixPrompt(false)}
                    pixCode={pixData.copyAndPaste}
                    phone={client.phone}
                    clientName={client.name}
                    title="Recibo Enviado!"
                />
            )}
        </div>
    );
}
