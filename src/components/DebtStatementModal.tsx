import { useState } from 'react';
import { useDocumentShare } from '../hooks/useDocumentShare';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { DocumentPreview } from './DocumentPreview';
import { X, FileText, Share2, Image, Copy, Check } from 'lucide-react';
import type { Client, Service } from '../types';
import { format } from 'date-fns';
import { useSettings, DEFAULT_COMPANY_NAME } from '../hooks/useData';
import { generatePixPayload, openPixWhatsApp, copyPixCode } from '../utils/PixUtils';
import { PixPromptModal } from './PixPromptModal';

import { formatLocalDate, getServicePrice, parseMonetaryValue, parseLocalDate, formatCurrency } from '../utils/dateUtils';

interface DebtStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: Client;
    pendingServices: Service[];
}

export function DebtStatementModal({ isOpen, onClose, client, pendingServices }: DebtStatementModalProps) {
    useLockBodyScroll(isOpen);
    const share = useDocumentShare('statement-printable', `extrato-${client.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.jpg`, 'Extrato de débitos');
    const settings = useSettings();
    const companyName = settings?.name?.trim() || DEFAULT_COMPANY_NAME;
    const pixKey = settings?.pixKey || '';
    const [copiedPix, setCopiedPix] = useState(false);
    const [showPixPrompt, setShowPixPrompt] = useState(false);

    // Sort pending services by date ascending
    const sortedPendingServices = [...pendingServices].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());

    const totalDebt = sortedPendingServices.reduce((acc, curr) => acc + getServicePrice(curr), 0);
    const pixData = pixKey ? generatePixPayload(pixKey, totalDebt, companyName) : null;

    if (!isOpen) return null;

    const handleGeneratePhoto = share.saveImage;

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
        let text = `*EXTRATO DE DÉBITOS - ${companyName.toUpperCase()}*\n\n` +
            `*Cliente:* ${client.name}\n` +
            `*Valor Total em Aberto:* ${formatCurrency((Number(totalDebt) || 0))}\n\n` +
            `*SERVIÇOS PENDENTES:*\n`;

        sortedPendingServices.forEach((service, index) => {
            text += `${index + 1}. ${formatLocalDate(service.date)} - ${service.type}${service.description ? ' - ' + service.description : ''} (${formatCurrency(getServicePrice(service))})\n`;
        });

        if (pixData && totalDebt > 0) {
            text += `\n*Pagamento via Pix:*\nChave: ${pixKey}\n_(O código Pix Copia e Cola será enviado a seguir em mensagem separada)_\n\n`;
        }

        text += `\nSegue em anexo o comprovante detalhado.`;
        const sent = await share.sendWhatsApp(text, client.phone);
        if (sent && pixData && totalDebt > 0) {
            setShowPixPrompt(true);
        }
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
                                <p className="text-slate-500 text-xs mb-3">Aponte a câmera do celular para o QR Code ao lado ou utilize a chave abaixo.</p>

                                <div className="bg-white border border-slate-200 p-3 rounded-lg">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">CHAVE PIX</p>
                                    <p className="font-mono text-slate-800 font-bold">{pixKey}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">Beneficiário: {companyName}</p>
                                </div>

                                {/* Botões interativos para enviar separado ou copiar (ocultos na imagem gerada) */}
                                <div className="no-print mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSendPixOnly}
                                        className="py-2 px-3 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                                        title="Enviar apenas o código Pix no WhatsApp para o cliente colar no banco"
                                    >
                                        <Share2 size={13} />
                                        <span>Enviar Pix Separado (Zap)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopyPix}
                                        className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                        title="Copiar código Pix Copia e Cola"
                                    >
                                        {copiedPix ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                        <span>{copiedPix ? 'Copiado!' : 'Copiar Pix (Copia e Cola)'}</span>
                                    </button>
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

                {/* Pix Quick Action Bar */}
                {pixData && totalDebt > 0 && (
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

                {/* Footer Buttons */}
                <div className="dark:bg-slate-900 dark:border-slate-800 p-5 border-t border-slate-100 bg-white flex flex-row gap-3 z-10 w-full shrink-0">
                    <button
                        onClick={handleGeneratePhoto}
                        className="flex-1 py-3.5 bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base border border-slate-200"
                    >
                        <Image size={18} className="text-slate-500" />
                        <span>{share.busy === 'image' ? 'Gerando...' : 'Salvar Imagem'}</span>
                    </button>

                    <button
                        onClick={handleShare}
                        className="flex-1 py-3.5 bg-[#25D366] text-white rounded-xl font-bold shadow-lg shadow-green-500/20 hover:bg-[#1ebd5a] transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                        <Share2 size={18} />
                        <span>{share.busy === 'whatsapp' ? 'Gerando...' : 'Enviar WhatsApp'}</span>
                    </button>
                </div>
            </div>

            {pixData && (
                <PixPromptModal
                    isOpen={showPixPrompt}
                    onClose={() => setShowPixPrompt(false)}
                    pixCode={pixData.copyAndPaste}
                    phone={client.phone}
                    clientName={client.name}
                    title="Extrato Enviado!"
                />
            )}
        </div >
    );
}
