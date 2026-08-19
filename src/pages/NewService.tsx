import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { addService, updateService } from '../lib/supabaseOperations';
import { useServiceTemplates } from '../hooks/useData';
import { ArrowLeft, Camera, Calendar, Save, DollarSign, ChevronDown, UserPlus, Plus, Trash2, Loader2 } from 'lucide-react';
import { ClientForm } from '../components/ClientForm';
import { parseLocalDate } from '../utils/dateUtils';
import { compressImage } from '../utils/imageUtils';
import type { Service, ServiceItem } from '../types';

export function NewService() {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const isEditing = !!id;
    const templates = useServiceTemplates();

    // Get clientId from navigation state or URL
    const state = location.state as { clientId?: string; prefillItems?: ServiceItem[]; isMaintenance?: boolean } | null;
    const [clientId, setClientId] = useState<string>(state?.clientId || '');

    // Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [nextDate, setNextDate] = useState('');
    const [photosBefore, setPhotosBefore] = useState<string[]>([]);
    const [photosAfter, setPhotosAfter] = useState<string[]>([]);
    const [status, setStatus] = useState<'Agendado' | 'Concluído' | 'Pendente' | 'Cancelado'>('Concluído');
    const [paymentStatus, setPaymentStatus] = useState<'Pago' | 'Pendente'>('Pendente');
    const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Cartão' | 'Pix' | 'Transferência'>('Pix');
    const [items, setItems] = useState<any[]>(
        state?.prefillItems || [
            { type: 'Limpeza', description: '', quantity: 1, price: 0 }
        ]
    );

    const [isClientFormOpen, setIsClientFormOpen] = useState(false);
    const [isNextMaintenanceEnabled, setIsNextMaintenanceEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Load existing service if editing
    useEffect(() => {
        if (isEditing && id) {
            db.services.get(id).then(service => {
                if (service) {
                    setClientId(service.clientId);
                    setDate(new Date(service.date).toISOString().split('T')[0]);
                    if (service.nextServiceDate) {
                        setNextDate(new Date(service.nextServiceDate).toISOString().split('T')[0]);
                    }
                    setPhotosBefore(service.photosBefore || []);
                    setPhotosAfter(service.photosAfter || []);
                    setStatus(service.status);
                    setPaymentStatus(service.paymentStatus);
                    if (service.paymentMethod) {
                        setPaymentMethod(service.paymentMethod);
                    }
                    if (service.items && service.items.length > 0) {
                        setItems(service.items);
                    } else {
                        // Fallback for old services
                        setItems([{
                            type: service.type,
                            description: service.description,
                            quantity: 1,
                            price: service.price
                        }]);
                    }
                }
            });
        }
    }, [isEditing, id]);

    // Load clients for dropdown if no clientId provided
    const clients = useLiveQuery(() => db.clients.toArray());

    // Auto-calculate next date (6 months)
    useEffect(() => {
        if (!isNextMaintenanceEnabled) {
            setNextDate('');
            return;
        }

        const hasCleaning = items.some(item =>
            item.type?.toLowerCase().includes('limpeza') ||
            item.description?.toLowerCase().includes('limpeza')
        );

        if (date && hasCleaning) {
            const d = new Date(date);
            d.setMonth(d.getMonth() + 6);
            setNextDate(d.toISOString().split('T')[0]);
        }
    }, [date, items, isNextMaintenanceEnabled]);

    // Handle initial prefill for maintenance type if not editing
    useEffect(() => {
        if (!isEditing && state?.isMaintenance) {
            setStatus('Concluído');
            setPaymentStatus('Pendente');
        }
    }, [isEditing, state]);

    const calculateTotal = () => {
        return items.reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
    };

    const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const templateId = e.target.value;
        const template = templates?.find(t => t.id === templateId);
        if (template) {
            const newItem = {
                type: template.name, // Now using the template name as the type
                description: template.description,
                quantity: 1,
                price: template.price
            };

            // If the first item is empty, replace it, otherwise add
            if (items.length === 1 && items[0].description === '' && items[0].price === 0) {
                setItems([newItem]);
            } else {
                setItems([...items, newItem]);
            }
        }
    };

    const addItem = () => {
        setItems([...items, { type: 'Limpeza', description: '', quantity: 1, price: 0 }]);
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];

        if (field === 'type') {
            const template = templates?.find(t => t.name.toLowerCase() === String(value).toLowerCase());
            if (template) {
                const currentDesc = newItems[index].description;
                const currentPrice = newItems[index].price;
                const tPrice = typeof template.price === 'string' ? parseFloat(template.price) : (template.price || 0);

                newItems[index] = {
                    ...newItems[index],
                    type: template.name,
                    description: currentDesc ? currentDesc : (template.description || ''),
                    price: currentPrice ? currentPrice : tPrice
                };
                setItems(newItems);
                return;
            }
        }

        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
        if (e.target.files) {
            const MAX_SIZE_MB = 15;
            const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

            for (const file of Array.from(e.target.files)) {
                if (file.size > MAX_SIZE_BYTES) {
                    alert(`O arquivo ${file.name} é muito grande. O tamanho máximo permitido é ${MAX_SIZE_MB}MB para não travar o aplicativo.`);
                    continue;
                }

                if (file.type.startsWith('video/')) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (type === 'before') {
                            setPhotosBefore(prev => [...prev, reader.result as string]);
                        } else {
                            setPhotosAfter(prev => [...prev, reader.result as string]);
                        }
                    };
                    reader.readAsDataURL(file);
                } else {
                    try {
                        const compressed = await compressImage(file);
                        if (type === 'before') {
                            setPhotosBefore(prev => [...prev, compressed]);
                        } else {
                            setPhotosAfter(prev => [...prev, compressed]);
                        }
                    } catch (error) {
                        console.error('Error compressing image:', error);
                    }
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientId) {
            alert('Selecione um cliente!');
            return;
        }

        try {
            setIsSaving(true);
            const totalPrice = calculateTotal();

            const primaryItem = items && items.length > 0 ? items[0] : { type: 'Serviço', description: '' };

            const serviceData: Omit<Service, 'id'> = {
                clientId: clientId,
                date: parseLocalDate(date),
                nextServiceDate: isNextMaintenanceEnabled && nextDate ? parseLocalDate(nextDate) : parseLocalDate(date),
                // Keep the primary type/desc from the first item for dashboard/legacy compatibility
                type: primaryItem.type || 'Serviço',
                description: primaryItem.description || '',
                items: (items || []).map(item => ({
                    ...item,
                    type: item.type || 'Serviço',
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0
                })),
                price: Number(totalPrice) || 0,
                photos: [],
                photosBefore: photosBefore || [],
                photosAfter: photosAfter || [],
                status: status || 'Concluído',
                paymentStatus: paymentStatus || 'Pendente',
                paymentMethod: paymentStatus === 'Pago' ? paymentMethod : undefined
            };

            if (isEditing) {
                await updateService(id!, serviceData);
            } else {
                await addService(serviceData);
            }

            navigate(-1); // Go back immediately
        } catch (error) {
            console.error("Error saving service:", error);
            alert("Erro ao salvar serviço.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                    {isEditing ? 'Editar Serviço' : 'Novo Serviço'}
                </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Client Selection */}
                <div className="glass-panel p-6 space-y-4">
                    <h3 className="font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Informações do Cliente</h3>

                    {!location.state?.clientId && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 leading-none">Cliente</label>
                            <div className="flex gap-2">
                                <select
                                    required
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    <option value="">Selecione um cliente...</option>
                                    {clients?.map(client => (
                                        <option key={client.id} value={client.id}>{client.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setIsClientFormOpen(true)}
                                    title="Novo Cliente"
                                    className="p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-800 transition-colors"
                                >
                                    <UserPlus size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data do Serviço</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            {['Concluído', 'Agendado', 'Pendente'].map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatus(s as any)}
                                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all
                                ${status === s ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                            `}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Service Items */}
                <div className="glass-panel p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-4">
                        <h3 className="font-semibold text-slate-800 dark:text-white">Itens do Serviço</h3>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Templates Dropdown */}
                            {templates && templates.length > 0 && (
                                <div className="relative flex-1 sm:flex-none">
                                    <select
                                        onChange={handleTemplateSelect}
                                        value=""
                                        className="w-full sm:w-auto appearance-none pl-3 pr-8 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-100 dark:border-blue-800 focus:outline-none cursor-pointer uppercase tracking-wider h-9"
                                    >
                                        <option value="">+ Adicionar Padrão</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={addItem}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase tracking-wider h-9"
                            >
                                <Plus size={12} />
                                Novo Item
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {items.map((item, index) => (
                            <div key={index} className="relative p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 space-y-4 group">
                                {items.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600 active:scale-90"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                                    <div className="sm:col-span-4">
                                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">Tipo</label>
                                        <input
                                            type="text"
                                            value={item.type}
                                            onChange={(e) => updateItem(index, 'type', e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500"
                                            placeholder="Ex: Limpeza, Carga de Gás..."
                                            list={`types-${index}`}
                                        />
                                        <datalist id={`types-${index}`}>
                                            {templates?.map(t => (
                                                <option key={t.id} value={t.name} />
                                            ))}
                                            <option value="Limpeza" />
                                            <option value="Instalação" />
                                            <option value="Manutenção" />
                                            <option value="Conserto" />
                                        </datalist>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">Qtd</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity === '' ? '' : item.quantity}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                updateItem(index, 'quantity', val === '' ? '' : Math.max(1, parseInt(val) || 1));
                                            }}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-6">
                                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">Valor Unitário (R$)</label>
                                        <div className="relative">
                                            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={item.price}
                                                onChange={(e) => updateItem(index, 'price', Number(e.target.value))}
                                                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500"
                                                placeholder="0,00"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">Descrição</label>
                                    <textarea
                                        rows={2}
                                        value={item.description}
                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500 resize-none"
                                        placeholder="Ex: Ar-condicionado 12.000 BTUs..."
                                    />
                                </div>

                                <div className="pt-2 flex justify-end border-t border-slate-100 dark:border-slate-800/50">
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                        Subtotal: <span className="text-blue-600 dark:text-blue-400">R$ {(item.price * (Number(item.quantity) || 1)).toFixed(2)}</span>
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <span className="text-xs font-black text-blue-900 dark:text-blue-300 uppercase tracking-widest">Total do Serviço</span>
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">R$ {calculateTotal().toFixed(2)}</span>
                    </div>
                </div>

                {/* Payment Section */}
                <div className="glass-panel p-6 space-y-4">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Pagamento</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status do Pagamento</label>
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                {[
                                    { id: 'Pago', color: 'text-green-600 dark:text-green-400' },
                                    { id: 'Pendente', color: 'text-orange-600 dark:text-orange-400' }
                                ].map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setPaymentStatus(s.id as any)}
                                        className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all
                                            ${paymentStatus === s.id
                                                ? 'bg-white dark:bg-slate-700 shadow-sm ' + s.color
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                                        `}
                                    >
                                        {s.id}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentStatus === 'Pago' && (
                            <div className="animate-fade-in">
                                <label className="block text-sm font-medium text-slate-700 mb-2">Forma de Pagamento</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['Pix', 'Dinheiro', 'Cartão', 'Transferência'].map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setPaymentMethod(m as any)}
                                            className={`py-2 rounded-xl text-[10px] font-bold transition-all border
                                                ${paymentMethod === m
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200 dark:shadow-none'
                                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-200 hover:text-blue-600'}
                                            `}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Photos Section */}
                <div className="glass-panel p-6 space-y-6">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Registros Fotográficos</h3>

                    {/* Photos Before */}
                    <div className="space-y-3">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                            FOTOS DE ANTES (INÍCIO)
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {photosBefore.map((media, index) => (
                                <div key={index} className="w-24 h-24 rounded-2xl border-2 border-slate-100 overflow-hidden relative group shadow-sm bg-black">
                                    {media.startsWith('data:video') ? (
                                        <video src={media} className="w-full h-full object-cover" controls={false} />
                                    ) : (
                                        <img src={media} alt="Antes" className="w-full h-full object-cover" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setPhotosBefore(photosBefore.filter((_, i) => i !== index))}
                                        className="absolute inset-0 bg-red-600/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity font-bold text-[10px]"
                                    >
                                        REMOVER
                                    </button>
                                </div>
                            ))}
                            <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 cursor-pointer transition-all bg-slate-50/50">
                                <Camera size={24} />
                                <span className="text-[10px] mt-1 font-bold">ADICIONAR</span>
                                <input type="file" accept="image/*,video/*" multiple onChange={(e) => handlePhotoUpload(e, 'before')} className="hidden" />
                            </label>
                        </div>
                    </div>

                    {/* Photos After */}
                    <div className="space-y-3">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            FOTOS DE DEPOIS (FINALIZADO)
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {photosAfter.map((media, index) => (
                                <div key={index} className="w-24 h-24 rounded-2xl border-2 border-slate-100 overflow-hidden relative group shadow-sm bg-black">
                                    {media.startsWith('data:video') ? (
                                        <video src={media} className="w-full h-full object-cover" controls={false} />
                                    ) : (
                                        <img src={media} alt="Depois" className="w-full h-full object-cover" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setPhotosAfter(photosAfter.filter((_, i) => i !== index))}
                                        className="absolute inset-0 bg-red-600/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity font-bold text-[10px]"
                                    >
                                        REMOVER
                                    </button>
                                </div>
                            ))}
                            <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 cursor-pointer transition-all bg-slate-50/50">
                                <Camera size={24} />
                                <span className="text-[10px] mt-1 font-bold">ADICIONAR</span>
                                <input type="file" accept="image/*,video/*" multiple onChange={(e) => handlePhotoUpload(e, 'after')} className="hidden" />
                            </label>
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className={`p-4 rounded-xl border transition-all ${isNextMaintenanceEnabled ? 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Calendar size={20} className={isNextMaintenanceEnabled ? "text-blue-500" : "text-slate-400"} />
                                    <div>
                                        <p className={`text-sm font-bold ${isNextMaintenanceEnabled ? "text-blue-900 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"}`}>Próxima Manutenção</p>
                                        <p className="text-[10px] text-slate-500 leading-none mt-0.5">Lembrar o cliente daqui a 6 meses</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={isNextMaintenanceEnabled}
                                        onChange={(e) => setIsNextMaintenanceEnabled(e.target.checked)}
                                    />
                                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {isNextMaintenanceEnabled && (
                                <div className="animate-fade-in">
                                    <input
                                        type="date"
                                        value={nextDate}
                                        onChange={(e) => setNextDate(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-400 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2.5 outline-none"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-4 mb-20">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className={`w-full py-3 text-white rounded-xl shadow-lg flex items-center justify-center gap-2 font-bold transition-all active:scale-95 ${isSaving ? 'bg-blue-400 cursor-not-allowed shadow-blue-400/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                            }`}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                Salvar Serviço
                            </>
                        )}
                    </button>
                </div>
            </form>

            {isClientFormOpen && (
                <ClientForm onClose={() => setIsClientFormOpen(false)} />
            )}
        </div>
    );
}
