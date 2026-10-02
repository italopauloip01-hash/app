import { isOwed } from '../utils/debt';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { Capacitor } from '@capacitor/core';
import { DocumentPreview } from './DocumentPreview';
import { toError } from '../lib/utils';
import { X, FileText, Share2, Image as ImageIcon } from 'lucide-react';
import type { Client, Service } from '../types';
import { format } from 'date-fns';
import { useSettings, DEFAULT_COMPANY_NAME } from '../hooks/useData';

import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { applyPrintColors } from '../utils/pdfUtils';
import { getServicePrice, formatCurrency } from '../utils/dateUtils';

interface GlobalDebtStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: Client[];
    allServices: Service[];
}

export function GlobalDebtStatementModal({ isOpen, onClose, clients, allServices }: GlobalDebtStatementModalProps) {
    useLockBodyScroll(isOpen);
    const settings = useSettings();
    const companyName = settings?.name?.trim() || DEFAULT_COMPANY_NAME;

    // Aggregate debts per client
    const debtors = clients.map(client => {
        const pendingServices = allServices.filter(s => s.clientId === client.id && isOwed(s));
        const debt = pendingServices.reduce((sum, s) => sum + getServicePrice(s), 0);
        return { client, debt, serviceCount: pendingServices.length };
    }).filter(d => d.debt > 0).sort((a, b) => b.debt - a.debt); // Sort by highest debt first

    const totalGlobalDebt = debtors.reduce((sum, d) => sum + d.debt, 0);

    if (!isOpen) return null;

    const handleGeneratePhoto = async () => {
        const originalElement = document.getElementById('global-statement-printable');
        if (!originalElement) {
            alert("Erro interno: Conteúdo do relatório não encontrado.");
            return;
        }

        const fileName = `relatorio-debitos-gerais-${format(new Date(), 'dd-MM-yyyy')}.jpg`;

        try {
            console.log("Gerando imagem do relatório...");

            // Clone to force absolute fixed layout for rendering
            const clone = originalElement.cloneNode(true) as HTMLElement;
            clone.id = 'global-statement-printable-clone';
            clone.className = clone.className.replace(/w-full|max-w-\[21cm\]/g, '');
            clone.style.width = '800px';
            clone.style.minWidth = '800px';
            clone.style.maxWidth = '800px';
            clone.style.position = 'absolute';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';

            document.body.appendChild(clone);

            await new Promise(resolve => setTimeout(resolve, 300));

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
                        title: 'Relatório de Débitos Gerais - AirTech Pro',
                        text: 'Relatório consolidado de todos os clientes em atraso.',
                        url: result.uri,
                        dialogTitle: 'Compartilhar Relatório'
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
            console.error("Erro detalhado ao gerar relatório Imagem:", error);
            if (error.message && error.message.includes('canceled')) return;
            alert(`Falha no relatório: ${error.message || "Tente novamente."}`);
        }
    };

    const handleShareText = () => {
        let text = `*RELATÓRIO DE DEVEDORES - ${companyName.toUpperCase()}*\n`;
        text += `*Data:* ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n`;

        debtors.forEach((d, index) => {
            text += `${index + 1}. *${d.client.name}*\n`;
            text += `   Dívida: ${formatCurrency((Number(d.debt) || 0))} (${d.serviceCount} serviços)\n`;
            text += `   Contato: ${d.client.phone}\n\n`;
        });

        text += `*TOTAL GERAL A RECEBER: ${formatCurrency((Number(totalGlobalDebt) || 0))}*\n\n`;
        text += `Segue em anexo o relatório detalhado em imagem.`;

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:bg-white print:p-0">
            <div className="dark:bg-slate-900 dark:border-slate-800 bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-scale-in border border-white/20 max-h-[94vh]">
                <div className="dark:bg-slate-900 dark:border-slate-800 px-6 py-5 border-b border-slate-100 flex flex-row items-center justify-between bg-white z-10 w-full relative shrink-0">
                    <h2 className="dark:text-white text-lg font-bold text-slate-800 flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                            <FileText size={16} />
                        </div>
                        Gerar Relatório de Devedores
                    </h2>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Pré-visualização: é o próprio documento que vira a imagem */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-600 truncate">{debtors.length} cliente(s) com débito</p><span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700">Total {formatCurrency(totalGlobalDebt)}</span></div>
                    <DocumentPreview>

                <div id="global-statement-printable" className="forced-light bg-white p-10 flex flex-col min-h-[1131px] w-[800px] min-w-[800px]" style={{ transform: 'none' }}>
                    <div className="flex justify-between items-end pb-6 border-b-[2px] border-slate-300">
                        <div>
                            <h1 className="text-[32px] font-black text-[#0f172a] tracking-tight uppercase leading-none">{companyName}</h1>
                            <p className="text-[#2563eb] font-bold text-[13px] tracking-widest uppercase mt-2">Visão Geral da Empresa</p>
                        </div>
                        <div className="text-right">
                            <p className="font-black text-[22px] text-[#0f172a] tracking-wider uppercase leading-none">RELATÓRIO DE DEVEDORES</p>
                            <p className="text-slate-400 text-[11px] mt-2 font-mono">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                    </div>

                    <div className="mt-8 bg-red-50 border border-red-200 p-6 rounded-xl flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">RESUMO FINANCEIRO PENDENTE</p>
                            <h2 className="text-xl font-bold text-slate-900">{debtors.length} Clientes em Atraso</h2>
                        </div>
                        <div className="text-right">
                            <span className="font-bold text-red-600 uppercase tracking-wider text-[11px] block">TOTAL A RECEBER:</span>
                            <span className="text-[32px] font-black text-[#dc2626] leading-none block">{formatCurrency((Number(totalGlobalDebt) || 0))}</span>
                        </div>
                    </div>

                    <div className="mt-10">
                        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-widest mb-4 border-b pb-2 border-slate-200">
                            DETALHAMENTO POR CLIENTE
                        </h3>

                        <div className="flex justify-between border-b-[2px] border-slate-200 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <div className="flex-1">CLIENTE / CONTATO</div>
                            <div className="w-24 text-center">SERVIÇOS</div>
                            <div className="w-32 text-right">VALOR DÍVIDA</div>
                        </div>

                        <div className="space-y-0 text-sm">
                            {debtors.map((d, index) => (
                                <div key={d.client.id} className="flex justify-between py-4 items-center border-b border-slate-100 bg-slate-50/30 px-2 rounded-lg break-inside-avoid">
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">
                                            {index + 1}. {d.client.name}
                                        </div>
                                        <div className="text-[11px] text-slate-500 font-medium mt-1">
                                            {d.client.phone} {d.client.address ? ` • ${d.client.address}` : ''}
                                        </div>
                                    </div>
                                    <div className="w-24 text-center font-bold text-slate-600">
                                        {d.serviceCount}x
                                    </div>
                                    <div className="w-32 text-right font-black text-slate-900">
                                        {formatCurrency((Number(d.debt) || 0))}
                                    </div>
                                </div>
                            ))}
                            {debtors.length === 0 && (
                                <div className="py-8 text-center text-emerald-500 font-bold italic">
                                    Não há clientes com serviços pendentes de pagamento. Excelente!
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-h-[80px]"></div>

                    <div className="mt-auto pt-8 border-t border-slate-200">
                        <div className="text-center">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                ESTE É UM RELATÓRIO INTERNO GERENCIAL DA EMPRESA {companyName?.toUpperCase() || ''}. NÃO COMPARTILHAR PUBLICAMENTE.
                            </p>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                @media print {
                    body {visibility: hidden; }
                #global-statement-printable, #global-statement-printable * {visibility: visible; }
                #global-statement-printable {
                    position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                padding: 0 !important;
                margin: 0 !important;
                            }
                .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
                .no-print {display: none !important; }
                        }
                    `}} />
                    </DocumentPreview>
                </div>

                <div className="dark:bg-slate-900 dark:border-slate-800 p-5 border-t border-slate-100 bg-white flex flex-row gap-3 z-10 w-full shrink-0">
                    <button onClick={handleGeneratePhoto} className="flex-1 py-3.5 bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base border border-slate-200">
                        <ImageIcon size={18} className="text-slate-500" />
                        <span>Salvar Imagem</span>
                    </button>
                    <button onClick={handleShareText} className="flex-1 py-3.5 bg-[#25D366] text-white rounded-xl font-bold shadow-lg shadow-green-500/20 hover:bg-[#1ebd5a] transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base">
                        <Share2 size={18} />
                        <span>Enviar WhatsApp</span>
                    </button>
                </div>
            </div>

        </div >
    );
}
