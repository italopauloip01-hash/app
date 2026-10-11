import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, QrCode, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../utils/dateUtils';
import { copyPixCode } from '../utils/PixUtils';

export function PixPaymentPage() {
    const [searchParams] = useSearchParams();
    const [copied, setCopied] = useState(false);
    const [copiedKey, setCopiedKey] = useState(false);

    const pixCode = searchParams.get('c') || '';
    const rawValue = searchParams.get('v') || '0';
    const amount = Number(rawValue) || 0;
    const companyName = searchParams.get('nome') || 'Empresa';
    const pixKey = searchParams.get('chave') || '';
    const clientName = searchParams.get('cli') || '';

    const qrCodeUrl = useMemo(() => {
        if (!pixCode) return '';
        return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pixCode)}`;
    }, [pixCode]);

    const handleCopyPix = async () => {
        if (!pixCode) return;
        const ok = await copyPixCode(pixCode);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        }
    };

    const handleCopyKey = async () => {
        if (!pixKey) return;
        const ok = await copyPixCode(pixKey);
        if (ok) {
            setCopiedKey(true);
            setTimeout(() => setCopiedKey(false), 3000);
        }
    };

    if (!pixCode && !pixKey) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-3xl max-w-md w-full shadow-xl border border-slate-200 text-center space-y-4">
                    <p className="text-slate-600 font-medium">Nenhum dado de pagamento Pix informado neste link.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-md space-y-4">
                {/* Card Principal */}
                <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6">
                    {/* Topo / Identificação */}
                    <div className="text-center space-y-2 border-b border-slate-100 pb-5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                            <ShieldCheck size={14} />
                            <span>Pagamento Seguro via Pix</span>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                            {companyName}
                        </h1>
                        {clientName && (
                            <p className="text-xs text-slate-500">
                                Cliente: <span className="font-semibold text-slate-700">{clientName}</span>
                            </p>
                        )}
                        <div className="pt-2">
                            <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Valor a pagar</span>
                            <div className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                                {formatCurrency(amount)}
                            </div>
                        </div>
                    </div>

                    {/* Botão de 1 Clique para Copiar */}
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={handleCopyPix}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl ${
                                copied
                                    ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-4 ring-emerald-100'
                                    : 'bg-[#25D366] hover:bg-[#1ebd5a] text-white shadow-green-500/30 hover:shadow-green-500/40'
                            }`}
                        >
                            {copied ? (
                                <>
                                    <Check size={22} className="animate-bounce" />
                                    <span>CÓDIGO PIX COPIADO!</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={22} />
                                    <span>CLIQUE AQUI PARA COPIAR O PIX</span>
                                </>
                            )}
                        </button>

                        {/* Mensagem de Feedback ao copiar */}
                        {copied ? (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs font-medium animate-fade-in">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                <span>Código copiado! Agora abra o app do seu banco e escolha <strong>Pix Copia e Cola</strong>.</span>
                            </div>
                        ) : (
                            <p className="text-center text-[11px] text-slate-500">
                                Ao tocar no botão, o código será copiado para você colar direto no banco.
                            </p>
                        )}
                    </div>

                    {/* QR Code para escanear */}
                    {qrCodeUrl && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <QrCode size={14} /> Ou escaneie o QR Code
                            </span>
                            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                <img src={qrCodeUrl} alt="QR Code Pix" className="w-48 h-48 rounded-lg" />
                            </div>
                        </div>
                    )}

                    {/* Chave Pix Alternativa */}
                    {pixKey && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                            <div className="truncate">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chave Pix</p>
                                <p className="font-mono text-xs font-bold text-slate-800 truncate">{pixKey}</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyKey}
                                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 active:scale-95"
                            >
                                {copiedKey ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                <span>{copiedKey ? 'Copiada' : 'Copiar'}</span>
                            </button>
                        </div>
                    )}

                    {/* Passo a Passo */}
                    <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-600">
                        <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Como pagar:</p>
                        <ol className="space-y-1.5 text-slate-500">
                            <li className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                                <span>Toque no botão verde acima para copiar o código</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                                <span>Abra o app do seu banco (Nubank, Itaú, etc.)</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                                <span>Escolha a opção <strong>Pix Copia e Cola</strong> e confirme</span>
                            </li>
                        </ol>
                    </div>
                </div>

                {/* Rodapé discreto */}
                <p className="text-center text-[11px] text-slate-500">
                    Gerado digitalmente via AirTech Pro
                </p>
            </div>
        </div>
    );
}
