import type { Service } from '../types';

export type PaymentMethod = NonNullable<Service['paymentMethod']>;

const PAYMENT_METHODS: PaymentMethod[] = ['Pix', 'Dinheiro', 'Cartão', 'Transferência'];

interface PaymentMethodPickerProps {
    subtitle: string;
    onSelect: (method: PaymentMethod) => void;
    onClose: () => void;
}

/** Janela para escolher a forma de pagamento ao marcar um serviço como pago. */
export function PaymentMethodPicker({ subtitle, onSelect, onClose }: PaymentMethodPickerProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-white">Forma de pagamento</h3>
                    <p className="text-sm text-slate-500">{subtitle}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(method => (
                        <button
                            key={method}
                            type="button"
                            onClick={() => onSelect(method)}
                            className="py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold text-sm border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors active:scale-95"
                        >
                            {method}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={onClose} className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                    Cancelar
                </button>
            </div>
        </div>
    );
}
