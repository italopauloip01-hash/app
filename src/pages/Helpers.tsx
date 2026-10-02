import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { addHelper, deleteHelper, addHelperEntry, deleteHelperEntry, updateHelperEntry } from '../lib/supabaseOperations';
import { useHelpers } from '../hooks/useData';
import { Users, DollarSign, Plus, Trash2, Briefcase, X, Calendar, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDate, getYearMonth, parseMonetaryValue, formatCurrency } from '../utils/dateUtils';
import type { HelperEntry } from '../types';

export function Helpers() {
    const helpers = useHelpers();
    const [selectedHelperId, setSelectedHelperId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [entryType, setEntryType] = useState<'work' | 'payment'>('work');
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [entryAmount, setEntryAmount] = useState('');
    const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [entryDesc, setEntryDesc] = useState('');
    const [referenceMonth, setReferenceMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

    // Fetch entries for the selected helper
    const helperEntries = useLiveQuery(
        () => selectedHelperId ? db.helperEntries.where('helperId').equals(selectedHelperId).toArray() : Promise.resolve([] as HelperEntry[]),
        [selectedHelperId]
    ) as HelperEntry[] | undefined;

    // Cleanup orphaned entries on mount
    useEffect(() => {
        const cleanupOrphans = async () => {
            try {
                const helpers = await db.helpers.toArray();
                // Sem ajudantes carregados (ex.: primeira sincronização ainda em andamento)
                // não dá para saber o que é órfão — não apaga nada.
                if (helpers.length === 0) return;
                const helperIds = new Set(helpers.map(h => h.id));
                const entries = await db.helperEntries.toArray();
                const orphanIds = entries.filter(e => !helperIds.has(e.helperId)).map(e => e.id!);

                if (orphanIds.length > 0) {
                    console.log(`Cleaning up ${orphanIds.length} orphaned entries`);
                    // Passa pela fila de sync, senão voltariam na próxima sincronização
                    await Promise.all(orphanIds.map(id => deleteHelperEntry(id)));
                }
            } catch (err) {
                console.error("Error cleaning orphans:", err);
            }
        };
        cleanupOrphans();
    }, []);

    const handleAddHelper = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        try {
            await addHelper({
                name: newName.trim(),
                phone: newPhone.trim(),
                active: true
            });
            setNewName('');
            setNewPhone('');
            setIsAddModalOpen(false);
        } catch (error) {
            console.error('Failed to add helper:', error);
        }
    };

    const handleDeleteHelper = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este ajudante? Todos os lançamentos também serão removidos.')) {
            try {
                const entries = await db.helperEntries.where('helperId').equals(id).toArray();
                await Promise.all(entries.map(e => deleteHelperEntry(e.id!)));
                await deleteHelper(id);

                if (selectedHelperId === id) setSelectedHelperId(null);
            } catch (error) {
                console.error("Error deleting helper:", error);
                alert("Erro ao excluir ajudante. Tente novamente.");
            }
        }
    };

    const handleAddEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedHelperId || !entryAmount) return;

        try {
            if (editingEntryId) {
                await updateHelperEntry(editingEntryId, {
                    date: parseLocalDate(entryDate),
                    type: entryType,
                    amount: parseFloat(entryAmount),
                    description: entryDesc.trim() || undefined
                });
            } else {
                await addHelperEntry({
                    helperId: selectedHelperId.toString(),
                    date: parseLocalDate(entryDate),
                    type: entryType,
                    amount: parseFloat(entryAmount),
                    description: entryDesc.trim() || undefined
                });
            }
            closeEntryModal();
        } catch (error) {
            console.error('Failed to save entry:', error);
        }
    };

    const openEditModal = (entry: HelperEntry) => {
        setEntryType(entry.type);
        setEntryDate(format(parseLocalDate(entry.date), 'yyyy-MM-dd'));
        setEntryAmount(String(parseMonetaryValue(entry.amount)));
        setEntryDesc(entry.description || '');
        setEditingEntryId(entry.id!);
        setIsEntryModalOpen(true);
    };

    const closeEntryModal = () => {
        setIsEntryModalOpen(false);
        setEditingEntryId(null);
        setEntryAmount('');
        setEntryDesc('');
        setEntryDate(format(new Date(), 'yyyy-MM-dd'));
    };

    const handleDeleteEntry = async (id: string) => {
        if (window.confirm('Excluir este lançamento?')) {
            await deleteHelperEntry(id);
        }
    };

    const filteredHelperEntries = helperEntries?.filter(entry => {
        return referenceMonth ? getYearMonth(entry.date) === referenceMonth : true;
    });

    const totalWork = filteredHelperEntries?.filter(e => e.type === 'work').reduce((acc, curr) => acc + parseMonetaryValue(curr.amount), 0) || 0;
    const totalPaid = filteredHelperEntries?.filter(e => e.type === 'payment').reduce((acc, curr) => acc + parseMonetaryValue(curr.amount), 0) || 0;
    const balance = totalWork - totalPaid;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Users className="text-blue-600" />
                        Minha Equipe
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Gerencie seus ajudantes e acompanhe pagamentos</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                >
                    <Plus size={20} />
                    Novo Ajudante
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Helpers List */}
                <div className="space-y-4">
                    <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Ajudantes Cadastrados</h2>
                    <div className="space-y-3">
                        {helpers?.map(helper => (
                            <div
                                key={helper.id}
                                onClick={() => setSelectedHelperId(helper.id!)}
                                className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between
                                    ${selectedHelperId === helper.id
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/30'
                                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-blue-300 text-slate-800 dark:text-slate-200'}
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold
                                        ${selectedHelperId === helper.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}
                                    `}>
                                        {helper.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold">{helper.name}</p>
                                        <p className={`text-xs ${selectedHelperId === helper.id ? 'text-blue-100' : 'text-slate-500'}`}>{helper.phone || 'Sem telefone'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteHelper(helper.id!);
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${selectedHelperId === helper.id ? 'hover:bg-white/10 text-white/70' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Helper Details & History */}
                <div className="lg:col-span-2 space-y-6">
                    {selectedHelperId ? (
                        <div className="animate-fade-in space-y-6">

                            {/* Month Filter */}
                            <div className="flex items-center gap-2 sm:gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 sm:p-4 rounded-2xl w-full sm:w-fit shadow-sm">
                                <Calendar size={18} className="text-slate-500 shrink-0" />
                                <span className="hidden sm:inline text-sm font-semibold text-slate-700 dark:text-slate-300">Mês de Referência:</span>
                                <input
                                    type="month"
                                    value={referenceMonth}
                                    onChange={(e) => setReferenceMonth(e.target.value)}
                                    className="flex-1 sm:flex-none min-w-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium text-sm"
                                />
                                {referenceMonth && (
                                    <button
                                        onClick={() => setReferenceMonth('')}
                                        className="shrink-0 px-2 py-2 text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase transition-colors"
                                    >
                                        Limpar
                                    </button>
                                )}
                            </div>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                <div className="glass-panel p-3 sm:p-6 border-l-4 border-l-blue-500 min-w-0">
                                    <div className="flex items-center gap-1.5 sm:gap-3 text-slate-500 dark:text-slate-400 mb-1 sm:mb-2">
                                        <Briefcase size={16} className="hidden sm:block" />
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Trabalhado</span>
                                    </div>
                                    <p className="text-sm sm:text-2xl font-black text-slate-800 dark:text-white truncate">{formatCurrency((Number(totalWork) || 0))}</p>
                                </div>
                                <div className="glass-panel p-3 sm:p-6 border-l-4 border-l-emerald-500 min-w-0">
                                    <div className="flex items-center gap-1.5 sm:gap-3 text-slate-500 dark:text-slate-400 mb-1 sm:mb-2">
                                        <DollarSign size={16} className="hidden sm:block" />
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Pago</span>
                                    </div>
                                    <p className="text-sm sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 truncate">{formatCurrency((Number(totalPaid) || 0))}</p>
                                </div>
                                <div className={`glass-panel p-3 sm:p-6 border-l-4 min-w-0 ${balance > 0 ? 'border-l-red-500' : 'border-l-slate-400'}`}>
                                    <div className="flex items-center gap-1.5 sm:gap-3 text-slate-500 dark:text-slate-400 mb-1 sm:mb-2">
                                        <Users size={18} />
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">A pagar</span>
                                    </div>
                                    <p className={`text-sm sm:text-2xl font-black truncate ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                        {formatCurrency((Number(balance) || 0))}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setEntryType('work');
                                        closeEntryModal(); // Reset fields before opening
                                        setIsEntryModalOpen(true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                                >
                                    <Plus size={18} />
                                    Lançar Trabalho
                                </button>
                                <button
                                    onClick={() => {
                                        setEntryType('payment');
                                        closeEntryModal(); // Reset fields before opening
                                        setIsEntryModalOpen(true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <DollarSign size={16} className="hidden sm:block" />
                                    Lançar Pagamento
                                </button>
                            </div>

                            {/* Detailed History */}
                            <div className="glass-panel overflow-hidden">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                                    <h3 className="font-bold text-slate-800 dark:text-white">Histórico de Trabalho</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                                            <tr>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                                                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                                                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest no-print">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredHelperEntries?.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()).map(entry => {
                                                const d = parseLocalDate(entry.date);
                                                return (
                                                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                                {format(d, 'dd/MM/yyyy')}
                                                            </p>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                                                            ${entry.type === 'work' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                {entry.type === 'work' ? 'Trabalho' : 'Pagamento'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <p className="text-xs text-slate-600 dark:text-slate-400">{entry.description || '-'}</p>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`text-sm font-bold ${entry.type === 'work' ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-600'}`}>
                                                                {entry.type === 'payment' && '- '}{formatCurrency((parseMonetaryValue(entry.amount)))}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right no-print">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => openEditModal(entry)}
                                                                    className="p-2.5 text-slate-400 hover:text-blue-500 transition-colors"
                                                                    title="Editar Lançamento"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteEntry(entry.id!)}
                                                                    className="p-2.5 text-slate-400 hover:text-red-500 transition-colors"
                                                                    title="Excluir Lançamento"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                            {(!filteredHelperEntries || filteredHelperEntries.length === 0) && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                                                        Nenhum lançamento registrado neste mês.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 glass-panel border-dashed border-2">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <Users className="text-slate-400 size={32}" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Selecione um ajudante</h3>
                            <p className="text-slate-500 dark:text-slate-400 max-w-xs mt-2">Clique em um ajudante na lista lateral para ver o histórico e pagamentos.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Novo Ajudante</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddHelper} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                                <input
                                    required
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ex: João Silva"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone (Opcional)</label>
                                <input
                                    type="tel"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="(00) 00000-0000"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all"
                                >
                                    Cadastrar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Entry Modal (Work/Payment) */}
            {isEntryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                                {editingEntryId ? (entryType === 'work' ? 'Editar Trabalho' : 'Editar Pagamento') : (entryType === 'work' ? 'Lançar Trabalho' : 'Lançar Pagamento')}
                            </h2>
                            <button onClick={closeEntryModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddEntry} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
                                <input
                                    required
                                    type="date"
                                    value={entryDate}
                                    onChange={(e) => setEntryDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valor (R$)</label>
                                <input
                                    required
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={entryAmount}
                                    onChange={(e) => setEntryAmount(e.target.value)}
                                    placeholder="0,00"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação (Opcional)</label>
                                <textarea
                                    value={entryDesc}
                                    onChange={(e) => setEntryDesc(e.target.value)}
                                    placeholder="Ex: Instalação no Cliente X"
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={closeEntryModal}
                                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg transition-all
                                        ${entryType === 'work' ? 'bg-blue-600 shadow-blue-500/30 hover:bg-blue-700' : 'bg-emerald-600 shadow-emerald-500/30 hover:bg-emerald-700'}`}
                                >
                                    Lançar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
