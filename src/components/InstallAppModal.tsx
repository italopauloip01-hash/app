import { X, Smartphone, Share, PlusSquare, MoreVertical, Zap, WifiOff, CheckCircle2 } from 'lucide-react';

interface InstallAppModalProps {
    isOpen: boolean;
    onClose: () => void;
    isIOS: boolean;
}

export function InstallAppModal({ isOpen, onClose, isIOS }: InstallAppModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
                className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/10 rounded-2xl ring-1 ring-white/20">
                            <Smartphone className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">Instalar AirTech Pro</h3>
                            <p className="text-blue-100 text-xs">Tenha o app direto na sua tela inicial</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        aria-label="Fechar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto space-y-5">
                    {/* Vantagens */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <Zap size={16} className="text-amber-500 shrink-0" />
                            <span>Acesso rápido em 1 toque</span>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <WifiOff size={16} className="text-blue-500 shrink-0" />
                            <span>Funciona mesmo offline</span>
                        </div>
                    </div>

                    {/* Passo a passo */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {isIOS ? 'Como instalar no iPhone / iPad' : 'Como instalar no celular'}
                        </p>

                        {isIOS ? (
                            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    <div>
                                        No Safari, toque no botão <strong>Compartilhar</strong>
                                        <div className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                                            <Share size={13} /> Compartilhar
                                        </div>
                                        <span className="text-slate-500 dark:text-slate-400 text-xs block mt-0.5">(o quadradinho com a seta para cima na barra inferior).</span>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    <div>
                                        Role para cima e toque em <strong>Adicionar à Tela de Início</strong>
                                        <div className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                                            <PlusSquare size={13} /> Adicionar
                                        </div>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    <div>
                                        Confirme tocando em <strong>Adicionar</strong> no canto superior direito. Pronto! O ícone ficará junto aos seus outros aplicativos.
                                    </div>
                                </li>
                            </ol>
                        ) : (
                            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    <div>
                                        Toque nos <strong>três pontinhos</strong> do navegador
                                        <div className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                                            <MoreVertical size={13} /> Menu
                                        </div>
                                        <span className="text-slate-500 dark:text-slate-400 text-xs block mt-0.5">(geralmente no canto superior ou inferior da tela).</span>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    <div>
                                        Selecione <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                                    </div>
                                </li>
                                <li className="flex items-start gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    <div>
                                        Confirme tocando em <strong>Instalar</strong>. O ícone do AirTech Pro será criado na sua gaveta de apps!
                                    </div>
                                </li>
                            </ol>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={18} />
                        <span>Entendi</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
