import { useState } from 'react';
import { Share2, Copy, Check, X, QrCode } from 'lucide-react';
import { openPixWhatsApp, copyPixCode } from '../utils/PixUtils';

interface PixPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    pixCode: string;
    phone?: string;
    clientName?: string;
    title?: string;
    subtitle?: string;
}

export function PixPromptModal({
    isOpen,
    onClose,
    pixCode,
    phone,
    clientName,
    title = 'Documento Enviado!',
    subtitle,
}: PixPromptModalProps) {
    const [copied, setCopied] = useState(false);

    if (!isOpen || !pixCode) return null;

    const handleCopy = async () => {
        const success = await copyPixCode(pixCode);
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleSendZap = async () => {
        await openPixWhatsApp(pixCode, phone);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="dark:bg-slate-900 dark:border-slate-800 bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200/80 text-center space-y-4 animate-scale-in relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/40 text-[#25D366] rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-800/50 shadow-sm">
                    <Share2 size={26} />
                </div>

                <div className="space-y-1">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                        {subtitle || (
                            <>
                                Deseja enviar o <strong>código Pix Copia e Cola separado</strong> no WhatsApp para {clientName ? <strong>{clientName}</strong> : 'o cliente'} apenas copiar e colar no banco?
                            </>
                        )}
                    </p>
                </div>

                {/* Caixa com prévia do código puro */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 text-left">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <QrCode size={11} /> Pix Copia e Cola
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Formato do Banco</span>
                    </div>
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate select-all">
                        {pixCode}
                    </p>
                </div>

                <div className="space-y-2 pt-2">
                    <button
                        type="button"
                        onClick={handleSendZap}
                        className="w-full py-3.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 transition-all active:scale-95"
                    >
                        <Share2 size={16} />
                        <span>Enviar Código Pix no Zap</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopy}
                        className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                        {copied ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
                        <span>{copied ? 'Código Pix Copiado!' : 'Copiar Código Pix'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold transition-colors"
                    >
                        Concluir / Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
