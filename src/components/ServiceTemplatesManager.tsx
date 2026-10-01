import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, Tag, DollarSign, FileText, Clock } from 'lucide-react';
import { formatDuration, itemDuration } from '../utils/schedule';

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
import { addServiceTemplate, updateServiceTemplate, deleteServiceTemplate } from '../lib/supabaseOperations';
import { useServiceTemplates } from '../hooks/useData';
import type { ServiceTemplate } from '../types';

export function ServiceTemplatesManager() {
    const templates = useServiceTemplates();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formData, setFormData] = useState<ServiceTemplate>({
        name: '',
        description: '',
        price: 0
    });

    const resetForm = () => {
        setFormData({ name: '', description: '', price: 0 });
        setIsAdding(false);
        setEditingId(null);
    };

    const handleEdit = (template: ServiceTemplate) => {
        setFormData(template);
        setEditingId(template.id!);
        setIsAdding(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir este serviço padrão?')) {
            await deleteServiceTemplate(id);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingId) {
            await updateServiceTemplate(editingId, formData);
        } else {
            await addServiceTemplate(formData);
        }
        resetForm();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">Serviços Padrão</h2>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm"
                    >
                        <Plus size={16} />
                        Adicionar Padrão
                    </button>
                )}
            </div>

            {isAdding && (
                <form onSubmit={handleSubmit} className="glass-panel p-4 animate-fade-in border border-blue-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Nome do Serviço</label>
                            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-blue-500/20">
                                <Tag size={16} className="text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: Limpeza Split 9000 BTUs"
                                    className="flex-1 outline-none text-sm bg-transparent dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Valor Padrão (R$)</label>
                            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-green-500/20">
                                <DollarSign size={16} className="text-green-500" />
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                    placeholder="0,00"
                                    className="flex-1 outline-none text-sm bg-transparent dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 mb-4">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Tempo médio (para a agenda)</label>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-blue-500/20">
                            <Clock size={16} className="text-blue-500" />
                            <select
                                value={formData.durationMinutes ?? ''}
                                onChange={e => setFormData({ ...formData, durationMinutes: e.target.value ? Number(e.target.value) : undefined })}
                                className="flex-1 outline-none text-sm bg-transparent dark:text-white"
                            >
                                <option value="">Automático ({formatDuration(itemDuration({ type: formData.name }))} pelo tipo)</option>
                                {DURATION_OPTIONS.map(m => <option key={m} value={m}>{formatDuration(m)}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1 mb-4">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Descrição Padrão</label>
                        <div className="flex gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 ring-blue-500/20">
                            <FileText size={16} className="text-slate-400 mt-0.5" />
                            <textarea
                                rows={2}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Detalhes deste serviço..."
                                className="flex-1 outline-none text-sm resize-none bg-transparent dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 text-sm font-medium"
                        >
                            <Check size={16} />
                            {editingId ? 'Atualizar' : 'Salvar Padrão'}
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates?.map(template => (
                    <div key={template.id} className="glass-card p-4 border border-slate-100 hover:border-blue-100 flex justify-between group">
                        <div>
                            <h3 className="font-semibold text-slate-800 dark:text-white">{template.name}</h3>
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{template.description || 'Sem descrição.'}</p>
                            <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md text-xs font-bold border border-green-100 dark:border-green-900/50">
                                R$ {(Number(template.price) || 0).toFixed(2)}
                            </div>
                            <div className="mt-2 ml-2 inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-md text-xs font-bold border border-blue-100 dark:border-blue-900/50">
                                <Clock size={12} />
                                {formatDuration(itemDuration({ type: template.name }, [template]))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleEdit(template)}
                                className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(template.id!)}
                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/40 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}

                {(!templates || templates.length === 0) && !isAdding && (
                    <div className="col-span-full py-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                        <Tag size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Nenhum serviço padrão cadastrado.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
