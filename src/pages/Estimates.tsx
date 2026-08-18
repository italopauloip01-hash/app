import { useState } from 'react';
import { FileText, Plus, Search, Trash2, Calendar, User, ArrowRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { deleteEstimate } from '../lib/supabaseOperations';
import { formatSimpleDate } from '../utils/dateUtils';
import { EstimateModal } from '../components/EstimateModal';
import type { Estimate } from '../types';

export function Estimates() {
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEstimate, setSelectedEstimate] = useState<Estimate | undefined>(undefined);

    const estimates = useLiveQuery(() =>
        db.estimates.reverse().toArray()
    ) || [];

    const filteredEstimates = estimates.filter(e =>
        e.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.clientPhone.includes(searchTerm)
    );

    const handleDelete = async (id: string) => {
        if (window.confirm('Deseja realmente excluir este orçamento?')) {
            await deleteEstimate(id);
        }
    };

    const handleOpenEstimate = (estimate: Estimate) => {
        setSelectedEstimate(estimate);
        setIsModalOpen(true);
    };

    const handleNewEstimate = () => {
        setSelectedEstimate(undefined);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Orçamentos</h1>
                    <p className="text-slate-500">Gerencie seus orçamentos salvos</p>
                </div>
                <button
                    onClick={handleNewEstimate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                >
                    <Plus size={20} />
                    <span>Novo Orçamento</span>
                </button>
            </div>

            <div className="glass-panel p-4 flex items-center gap-4 shadow-sm border border-white/20">
                <Search className="text-slate-400" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por cliente ou telefone..."
                    className="flex-1 bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
            </div>

            {estimates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <FileText size={40} className="text-slate-300" />
                    </div>
                    <p className="text-lg font-medium">Nenhum orçamento salvo.</p>
                    <p className="text-sm">Os orçamentos que você finalizar serão listados aqui.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEstimates.map((estimate) => (
                        <div
                            key={estimate.id}
                            className="glass-card p-6 flex flex-col gap-4 group hover:border-blue-200 dark:hover:border-blue-900 transition-all relative"
                        >
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                        <Calendar size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">
                                            {formatSimpleDate(estimate.date)}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white truncate max-w-[180px]">
                                        {estimate.clientName}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDelete(estimate.id!)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Excluir"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                                    <User size={14} />
                                    <span className="truncate">{estimate.clientPhone}</span>
                                </div>
                                <div className="py-2 border-y border-slate-100 dark:border-slate-800">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">{estimate.items.length} {estimate.items.length === 1 ? 'item' : 'itens'}</span>
                                        <span className="font-black text-slate-800 dark:text-white">R$ {estimate.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleOpenEstimate(estimate)}
                                className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all group-hover:bg-blue-600 group-hover:text-white"
                            >
                                <span>Ver Orçamento</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <EstimateModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedEstimate(undefined);
                    }}
                    initialEstimate={selectedEstimate}
                />
            )}
        </div>
    );
}
