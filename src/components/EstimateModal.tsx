import { X, Share2, Plus, FileText, Search, Trash2, Calendar, MapPin, Phone, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Client } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettings, useClients, useServiceTemplates } from '../hooks/useData';
import { addEstimate, updateEstimate } from '../lib/supabaseOperations';
import { formatWhatsAppNumber } from '../utils/phoneUtils';
import { formatLocalDate, parseMonetaryValue } from '../utils/dateUtils';
import { generateUUID } from '../utils/uuid';

import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';
import { applyPrintColors } from '../utils/pdfUtils';

interface EstimateItem {
    type: string;
    description: string;
    quantity: number | '';
    price: number;
}

interface EstimateModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialClient?: Client;
    initialEstimate?: any; // from db.estimates
}

export function EstimateModal({ isOpen, onClose, initialClient, initialEstimate }: EstimateModalProps) {
    const settings = useSettings();
    const allClients = useClients() || [];
    const templates = useServiceTemplates() || [];
    const companyName = settings?.name || 'FrioTech Soluções';

    // Form State
    const [clientInfo, setClientInfo] = useState({
        id: '',
        name: '',
        phone: '',
        address: ''
    });
    const [items, setItems] = useState<EstimateItem[]>([
        { type: 'Instalação', description: '', quantity: 1, price: 0 }
    ]);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [validityDays, setValidityDays] = useState(7);

    // Pickers State
    const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
    const [isServicePickerOpen, setIsServicePickerOpen] = useState<{ isOpen: boolean; index: number }>({ isOpen: false, index: -1 });
    const [searchTerm, setSearchTerm] = useState('');

    // Update client info when initialClient or initialEstimate changes
    useEffect(() => {
        if (initialEstimate) {
            setClientInfo({
                id: initialEstimate.clientId || '',
                name: initialEstimate.clientName,
                phone: initialEstimate.clientPhone,
                address: initialEstimate.clientAddress
            });
            setItems(initialEstimate.items);
            setDate(format(new Date(initialEstimate.date), 'yyyy-MM-dd'));
            setValidityDays(initialEstimate.validityDays);
        } else if (initialClient) {
            setClientInfo({
                id: initialClient.id || '',
                name: initialClient.name || '',
                phone: initialClient.phone || '',
                address: initialClient.address || ''
            });
        } else {
            setClientInfo({ id: '', name: '', phone: '', address: '' });
            setItems([{ type: 'Instalação', description: '', quantity: 1, price: 0 }]);
        }
    }, [initialClient, initialEstimate, isOpen]);

    if (!isOpen) return null;

    const totalValue = items.reduce((acc, item) => acc + (parseMonetaryValue(item.price) * (Number(item.quantity) || 1)), 0);
    const validUntil = new Date(date);
    validUntil.setDate(validUntil.getDate() + validityDays);

    const addItem = () => {
        setItems([...items, { type: 'Manutenção', description: '', quantity: 1, price: 0 }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: keyof EstimateItem, value: any) => {
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

    const handleShare = () => {
        let text = `*ORÇAMENTO - ${companyName.toUpperCase()}*\n\n` +
            `*Cliente:* ${clientInfo.name}\n` +
            `*Data:* ${formatLocalDate(date)}\n` +
            `*Validade:* ${validityDays} dias\n` +
            `*Valor Total:* R$ ${(Number(totalValue) || 0).toFixed(2)}\n\n` +
            `*ITENS DO ORÇAMENTO:*\n`;

        items.forEach(item => {
            const qty = Number(item.quantity) || 1;
            const price = parseMonetaryValue(item.price);
            if (qty > 1) {
                text += `- ${qty}x ${item.type} (R$ ${price.toFixed(2)}/un): R$ ${(price * qty).toFixed(2)}\n`;
            } else {
                text += `- ${qty}x ${item.type}: R$ ${(price * qty).toFixed(2)}\n`;
            }
        });

        text += `\nEstamos à disposição para qualquer dúvida!`;

        const url = `https://wa.me/${formatWhatsAppNumber(clientInfo.phone)}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleSave = async () => {
        if (!clientInfo.name) {
            alert("Informe o nome do cliente.");
            return;
        }

        try {
            const estimateData = {
                id: initialEstimate?.id || generateUUID(),
                clientId: clientInfo.id || undefined,
                clientName: clientInfo.name,
                clientPhone: clientInfo.phone,
                clientAddress: clientInfo.address,
                date: new Date(date),
                validityDays,
                items: items.map(item => ({ ...item, quantity: Number(item.quantity) || 1 })),
                total: totalValue,
                status: 'Pendente' as const
            };

            if (initialEstimate?.id) {
                await updateEstimate(initialEstimate.id, estimateData);
            } else {
                await addEstimate(estimateData);
            }

            handleGeneratePhoto();
        } catch (error) {
            console.error("Error saving estimate:", error);
            alert("Erro ao salvar orçamento.");
        }
    };

    const handleGeneratePhoto = async () => {
        const originalElement = document.getElementById('estimate-content');
        if (!originalElement) {
            alert("Erro interno: Conteúdo do orçamento não encontrado.");
            return;
        }

        const fileName = `orcamento-${clientInfo.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.jpg`;

        try {
            const clone = originalElement.cloneNode(true) as HTMLElement;
            clone.id = 'estimate-content-clone';
            clone.className = clone.className.replace(/w-full|max-w-\[21cm\]/g, '');
            clone.style.width = '800px';
            clone.style.minWidth = '800px';
            clone.style.maxWidth = '800px';
            clone.style.position = 'absolute';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';

            document.body.appendChild(clone);
            await new Promise(resolve => setTimeout(resolve, 300));

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

            if (typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
                const base64Data = base64Uri.split(',')[1] || base64Uri.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });
                await new Promise(resolve => setTimeout(resolve, 300));

                try {
                    await Share.share({
                        title: 'Orçamento - AirTech Pro',
                        text: `Orçamento de serviço - ${clientInfo.name}`,
                        url: result.uri,
                        dialogTitle: 'Compartilhar Orçamento'
                    });
                } catch (shareError: any) {
                    if (shareError.message && shareError.message.includes('canceled')) return;
                    throw shareError;
                }
            } else {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = base64Uri;
                link.click();
            }
        } catch (error: any) {
            console.error("Erro ao gerar Foto:", error);
            if (error.message && error.message.includes('canceled')) return;
            alert(`Erro ao gerar Foto: ${error.message || "Tente novamente."}`);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:bg-white print:p-0">
                <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:w-full relative border border-slate-100 dark:border-slate-800">

                    {/* Navbar */}
                    <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 print:hidden flex-shrink-0 z-10 w-full">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                                <FileText size={22} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">
                                    {initialEstimate ? 'Editar Orçamento' : 'Novo Orçamento'}
                                </h2>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mt-1">Gerador Profissional</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors active:scale-95">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                        {/* Editor Sidebar */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/50 space-y-6 lg:max-w-md lg:border-r lg:border-slate-100 dark:lg:border-slate-800">

                            {/* Client Setup */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Cliente e Data</h3>
                                    <button
                                        onClick={() => { setIsClientPickerOpen(true); setSearchTerm(''); }}
                                        className="text-[10px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all shadow-sm active:scale-95"
                                    >
                                        <Search size={12} />
                                        BUSCAR CLIENTE
                                    </button>
                                </div>
                                <div className="glass-panel p-4 space-y-4 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl">
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="Nome do Cliente"
                                            value={clientInfo.name}
                                            onChange={(e) => setClientInfo({ ...clientInfo, name: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium dark:text-white"
                                        />
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="tel"
                                                    placeholder="Telefone"
                                                    value={clientInfo.phone}
                                                    onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })}
                                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                                />
                                            </div>
                                            <div className="relative">
                                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="date"
                                                    value={date}
                                                    onChange={(e) => setDate(e.target.value)}
                                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white dark:color-scheme-dark"
                                                />
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Endereço Completo"
                                                value={clientInfo.address}
                                                onChange={(e) => setClientInfo({ ...clientInfo, address: e.target.value })}
                                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Service Items */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Itens do Orçamento</h3>
                                    <button
                                        onClick={addItem}
                                        className="text-[10px] font-black bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 active:scale-95"
                                    >
                                        <Plus size={12} />
                                        ADD ITEM
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {items.map((item, idx) => (
                                        <div key={idx} className="group relative bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-all hover:shadow-md">
                                            <button
                                                onClick={() => removeItem(idx)}
                                                className="absolute -top-2 -right-2 w-7 h-7 bg-white dark:bg-slate-700 text-red-500 border border-slate-100 dark:border-slate-600 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm active:scale-90"
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            <div className="flex gap-2">
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Tipo de Serviço"
                                                        value={item.type}
                                                        list={`est-types-${idx}`}
                                                        onChange={(e) => updateItem(idx, 'type', e.target.value)}
                                                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:border-blue-500 outline-none font-bold dark:text-white"
                                                    />
                                                    <datalist id={`est-types-${idx}`}>
                                                        {templates?.map(t => (
                                                            <option key={t.id} value={t.name} />
                                                        ))}
                                                        <option value="Limpeza" />
                                                        <option value="Instalação" />
                                                        <option value="Manutenção" />
                                                        <option value="Conserto" />
                                                    </datalist>
                                                </div>
                                                <button
                                                    onClick={() => { setIsServicePickerOpen({ isOpen: true, index: idx }); setSearchTerm(''); }}
                                                    className="w-10 h-10 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                                    title="Escolher dos modelos"
                                                >
                                                    <Search size={18} />
                                                </button>
                                            </div>

                                            <textarea
                                                placeholder="Descrição ou detalhes..."
                                                value={item.description}
                                                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:border-blue-500 outline-none resize-none h-20 dark:text-slate-200"
                                            />

                                            <div className="flex items-center gap-4">
                                                <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-900 rounded-xl p-1">
                                                    <button
                                                        onClick={() => updateItem(idx, 'quantity', Math.max(1, (Number(item.quantity) || 1) - 1))}
                                                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                                                    >
                                                        -
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity === '' ? '' : item.quantity}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            updateItem(idx, 'quantity', val === '' ? '' : Math.max(1, parseInt(val) || 1));
                                                        }}
                                                        className="flex-1 w-full text-center font-bold text-slate-700 dark:text-slate-200 text-sm bg-transparent border-none outline-none focus:ring-0 p-0 m-0"
                                                    />
                                                    <button
                                                        onClick={() => updateItem(idx, 'quantity', (Number(item.quantity) || 0) + 1)}
                                                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <div className="flex-[2] relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">R$</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Preço"
                                                        value={item.price || ''}
                                                        onChange={(e) => updateItem(idx, 'price', Number(e.target.value))}
                                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:border-blue-500 outline-none font-black text-slate-800 dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <div className="p-4 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-500/20">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Total do Orçamento</span>
                                    <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">VALIDO POR {validityDays} DIAS</span>
                                </div>
                                <div className="text-3xl font-black">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>

                        {/* Preview Area */}
                        <div className="hidden lg:flex flex-1 bg-slate-200/50 p-10 overflow-y-auto items-center justify-center">
                            <div className="sticky top-0 bg-white rounded-lg shadow-2xl scale-[0.65] xl:scale-[0.8] origin-center print:static print:scale-100 aspect-[1/1.41] w-[800px] overflow-hidden">
                                {/* The actual export structure but visible here */}
                                <EstimatePreviewContent
                                    id="preview-display"
                                    companyName={companyName}
                                    clientInfo={clientInfo}
                                    date={date}
                                    items={items}
                                    totalValue={totalValue}
                                    validityDays={validityDays}
                                    validUntil={validUntil}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-3 no-print flex-shrink-0 z-10 w-full">
                        <div className="flex items-center gap-3 px-4 mr-auto hidden sm:flex">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Validade</p>
                                <input
                                    type="number"
                                    value={validityDays}
                                    onChange={(e) => setValidityDays(Number(e.target.value))}
                                    className="w-16 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 focus:ring-0"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleShare}
                            className="flex-1 py-3.5 px-6 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all active:scale-95"
                        >
                            <Share2 size={20} />
                            COMPARTILHAR ZAP
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-[1.5] py-3.5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 text-base uppercase tracking-wider"
                        >
                            <Check size={22} />
                            SALVAR E GERAR FOTO
                        </button>
                    </div>
                </div>
            </div>

            {/* Hidden Export Content - STRICT 800px Layout */}
            <div className="absolute top-[-9999px] left-[-9999px] opacity-0 pointer-events-none overflow-hidden">
                <EstimatePreviewContent
                    id="estimate-content"
                    companyName={companyName}
                    clientInfo={clientInfo}
                    date={date}
                    items={items}
                    totalValue={totalValue}
                    validityDays={validityDays}
                    validUntil={validUntil}
                />
            </div>

            {/* Client Picker Modal */}
            {isClientPickerOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[70vh] border border-slate-100 dark:border-slate-800">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h4 className="font-bold text-slate-800 dark:text-white">Selecionar Cliente</h4>
                            <button onClick={() => setIsClientPickerOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X size={20} /></button>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Buscar por nome ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {allClients
                                .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm))
                                .map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setClientInfo({ id: c.id || '', name: c.name, phone: c.phone, address: c.address });
                                            setIsClientPickerOpen(false);
                                        }}
                                        className="w-full p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center justify-between group"
                                    >
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">{c.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-500">{c.phone}</p>
                                        </div>
                                        <Plus size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
                                    </button>
                                ))}
                            {allClients.length === 0 && (
                                <p className="text-center py-8 text-slate-400 dark:text-slate-600 text-sm">Nenhum cliente cadastrado.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Service Picker Modal */}
            {isServicePickerOpen.isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[70vh] border border-slate-100 dark:border-slate-800">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h4 className="font-bold text-slate-800 dark:text-white">Selecionar Serviço</h4>
                            <button onClick={() => setIsServicePickerOpen({ isOpen: false, index: -1 })} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X size={20} /></button>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Buscar serviço..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {templates
                                .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => {
                                            updateItem(isServicePickerOpen.index, 'type', t.name);
                                            setIsServicePickerOpen({ isOpen: false, index: -1 });
                                        }}
                                        className="w-full p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center justify-between group"
                                    >
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">{t.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-500">R$ {t.price.toLocaleString('pt-BR')}</p>
                                        </div>
                                        <Plus size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
                                    </button>
                                ))}
                            {templates.length === 0 && (
                                <p className="text-center py-8 text-slate-400 dark:text-slate-600 text-sm">Nenhum serviço cadastrado.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Sub-component for the actual document content to avoid duplication
function EstimatePreviewContent({ id, companyName, clientInfo, date, items, totalValue, validityDays, validUntil }: any) {
    return (
        <div id={id} className="bg-white p-12 flex flex-col min-h-[1131px] w-[800px] min-w-[800px]">
            {/* Header */}
            <div className="flex justify-between items-end pb-8 border-b-4 border-slate-900">
                <div>
                    <h1 className="text-[40px] font-black text-[#0f172a] tracking-tighter uppercase leading-none">{companyName}</h1>
                    <p className="text-[#2563eb] font-bold text-[14px] tracking-[0.3em] uppercase mt-3">Orçamento de Serviços Profissionais</p>
                </div>
                <div className="text-right">
                    <p className="font-black text-[24px] text-slate-900 tracking-wider uppercase leading-none">ORÇAMENTO</p>
                    <p className="text-slate-400 text-[12px] mt-2 font-mono">#{format(new Date(), 'yyyyMMddHHmm')}</p>
                </div>
            </div>

            {/* Info Bar */}
            <div className="mt-10 grid grid-cols-2 gap-12">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PARA O CLIENTE</p>
                        <h2 className="text-xl font-bold text-slate-900 leading-tight">{clientInfo.name || '(Nome não informado)'}</h2>
                    </div>
                    <div className="text-slate-500 text-[13px] font-medium space-y-1 border-l-2 border-slate-100 pl-4">
                        <p className="flex items-center gap-2"><MapPin size={12} className="text-slate-400" /> {clientInfo.address || "Endereço não informado"}</p>
                        <p className="flex items-center gap-2"><Phone size={12} className="text-slate-400" /> {clientInfo.phone || "Telefone não informado"}</p>
                    </div>
                </div>
                <div className="text-right space-y-4">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DATA DA EMISSÃO</p>
                        <p className="font-black text-slate-800 text-lg uppercase">
                            {format(new Date(date), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="inline-block bg-blue-50 text-blue-700 px-4 py-1.5 rounded-lg text-[11px] font-black tracking-widest uppercase">
                            VALIDADE: {validityDays} DIAS
                        </span>
                    </div>
                </div>
            </div>

            {/* Items Table */}
            <div className="mt-12 flex-1">
                <div className="flex justify-between bg-slate-900 p-4 rounded-t-xl text-[10px] font-black text-white uppercase tracking-[0.2em]">
                    <div className="w-16">QTD</div>
                    <div className="flex-1">DESCRIÇÃO DO SERVIÇO / PEÇAS</div>
                    <div className="w-32 text-right">VALOR UNIT.</div>
                    <div className="w-32 text-right">VALOR TOTAL</div>
                </div>

                <div className="border-x border-slate-200">
                    {items.map((item: EstimateItem, idx: number) => (
                        <div key={idx} className={`flex justify-between p-5 border-b border-slate-100 items-start ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                            <div className="w-16 font-black text-slate-800 text-base">{Number(item.quantity) || 1}x</div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-900 text-base uppercase">{item.type}</p>
                                {item.description && <p className="text-slate-500 text-xs mt-1 leading-relaxed">{item.description}</p>}
                            </div>
                            <div className="w-32 text-right font-medium text-slate-500 text-sm">{(Number(item.quantity) || 1) > 1 ? `R$ ${parseMonetaryValue(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</div>
                            <div className="w-32 text-right font-black text-slate-900 text-base">R$ {(parseMonetaryValue(item.price) * (Number(item.quantity) || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                    ))}
                </div>

                {/* Total */}
                <div className="flex justify-end p-8 bg-slate-50 rounded-b-xl border border-slate-200 border-t-0 mt-[-1px]">
                    <div className="text-right space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOTAL FINAL DO INVESTIMENTO</p>
                        <p className="text-[42px] font-black text-[#0f172a] leading-none">
                            <span className="text-xl align-top mr-2">R$</span>
                            {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Validity Message */}
            <div className="mt-12 bg-blue-50 border-2 border-blue-100 rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <FileText size={100} />
                </div>
                <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">CONDIÇÕES GERAIS</h4>
                <div className="grid grid-cols-2 gap-8">
                    <ul className="text-[12px] text-slate-600 space-y-2 font-medium">
                        <li className="flex gap-2"><span>•</span> Este orçamento é válido até o dia <strong>{format(validUntil, "dd/MM/yyyy")}</strong>.</li>
                        <li className="flex gap-2"><span>•</span> Pagamento via PIX, Cartão ou Boleto Bancário.</li>
                    </ul>
                    <ul className="text-[12px] text-slate-600 space-y-2 font-medium">
                        <li className="flex gap-2"><span>•</span> Garantia de 90 dias em serviços e peças novas.</li>
                        <li className="flex gap-2"><span>•</span> Prazo de execução conforme agendamento prévio.</li>
                    </ul>
                </div>
            </div>

            {/* signature area */}
            <div className="mt-auto pt-16 flex justify-between items-end border-t border-slate-100">
                <div className="max-w-[400px]">
                    <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed uppercase tracking-wider">
                        Documento gerado eletronicamente via AirTech Pro - Sistema de Gestão para Climatização
                    </p>
                </div>
                <div className="text-center w-[300px]">
                    <div className="h-[2px] bg-slate-900 mb-3"></div>
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em]">{companyName.toUpperCase()}</p>
                </div>
            </div>
        </div>
    );
}
