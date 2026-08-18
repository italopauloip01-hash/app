import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClient, useServices } from '../hooks/useData';
import { addService, updateService, deleteService, deleteClient } from '../lib/supabaseOperations';
import { ClientForm } from '../components/ClientForm';
import { ReceiptModal } from '../components/ReceiptModal';
import { DebtStatementModal } from '../components/DebtStatementModal';
import { EstimateModal } from '../components/EstimateModal';
import {
    User,
    Phone,
    MapPin,
    Calendar,
    Plus,
    Wrench,
    ArrowLeft,
    UserPlus,
    FileText,
    Pencil,
    Image as ImageIcon,
    X,
    Trash2,
    Share2,
    AlertCircle
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { formatLocalDate } from '../utils/dateUtils';
import type { Service } from '../types';

export function ClientDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const client = useClient(id!);
    const services = useServices(id);

    const [activeTab, setActiveTab] = useState<'services' | 'photos'>('services');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

    // Multi-select state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
    const [isSharingPhotos, setIsSharingPhotos] = useState(false);

    const handleViewReceipt = (service: Service) => {
        setSelectedService(service);
        setIsReceiptOpen(true);
    };

    const handleTogglePayment = async (service: Service) => {
        const newStatus = service.paymentStatus === 'Pago' ? 'Pendente' : 'Pago';
        const method = newStatus === 'Pago' ? 'Pix' : undefined; // Default to Pix when marking as paid

        try {
            await updateService(service.id!, {
                paymentStatus: newStatus,
                paymentMethod: method
            });
        } catch (error) {
            console.error("Error updating payment status:", error);
        }
    };

    const handleDeleteService = async (id: string) => {
        if (window.confirm('Tem certeza que deseja apagar este serviço? Esta ação não pode ser desfeita.')) {
            try {
                await deleteService(id);
            } catch (error) {
                console.error("Error deleting service:", error);
            }
        }
    };

    const handleDeleteClient = async () => {
        if (window.confirm('Tem certeza que deseja apagar este cliente e todos os seus serviços? Esta ação não pode ser desfeita.')) {
            try {
                if (services && services.length > 0) {
                    for (const service of services) {
                        await deleteService(service.id!);
                    }
                }
                await deleteClient(client!.id!);
                navigate('/clients', { replace: true });
            } catch (error) {
                console.error("Error deleting client:", error);
                alert("Erro ao apagar cliente.");
            }
        }
    };

    const handleCatalogPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files.length) return;
        setIsUploadingPhoto(true);

        try {
            const MAX_SIZE_MB = 15;
            const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

            const validFiles = Array.from(e.target.files).filter(file => {
                if (file.size > MAX_SIZE_BYTES) {
                    alert(`O arquivo ${file.name} é muito grande. O tamanho máximo permitido é ${MAX_SIZE_MB}MB.`);
                    return false;
                }
                return true;
            });

            if (validFiles.length === 0) {
                setIsUploadingPhoto(false);
                return;
            }

            const readers = validFiles.map(file => {
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
            });

            const base64Photos = await Promise.all(readers);

            // Create a lightweight service entry just to hold these generic catalog photos
            await addService({
                clientId: client!.id!,
                date: new Date(),
                nextServiceDate: new Date(),
                type: 'Outro',
                description: 'Foto Avulsa (Catálogo)',
                items: [{ type: 'Outro', description: 'Foto adicionada pelo catálogo', quantity: 1, price: 0 }],
                price: 0,
                status: 'Concluído',
                paymentStatus: 'Pago',
                paymentMethod: 'Dinheiro', // placeholder
                photos: base64Photos // Use legacy generic photos array
            });

            // Refresh UI implicitly happens because `services` is a liveQuery
        } catch (error) {
            console.error("Erro ao salvar foto", error);
            alert("Erro ao salvar foto.");
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleSharePhoto = async () => {
        const photosToShare = isSelectionMode ? Array.from(selectedPhotos) : (selectedPhoto ? [selectedPhoto] : []);
        if (photosToShare.length === 0) return;

        setIsSharingPhotos(true);
        try {
            // Check if we are running under Capacitor / Native
            if (typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
                const fileUris = [];
                for (let i = 0; i < photosToShare.length; i++) {
                    const photoBase64 = photosToShare[i];
                    const base64Data = photoBase64.split(',')[1];
                    const ext = photoBase64.split(';')[0].split('/')[1] || 'jpeg';
                    const fileName = `foto-servico-${Date.now()}-${i}.${ext}`;

                    const result = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: Directory.Cache
                    });
                    fileUris.push(result.uri);
                }

                await Share.share({
                    title: 'Fotos do Serviço - AirTech Pro',
                    text: `Registros fotográficos do cliente - ${client?.name}`,
                    files: fileUris,
                });

                if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setSelectedPhotos(new Set());
                }
            } else {
                // Web fallback
                if (navigator.share) {
                    const filesToShare = [];
                    for (let i = 0; i < photosToShare.length; i++) {
                        const photoBase64 = photosToShare[i];
                        const response = await fetch(photoBase64);
                        const blob = await response.blob();
                        const ext = blob.type.split('/')[1] || 'jpeg';
                        const file = new File([blob], `servico-airtech-${i}.${ext}`, { type: blob.type });
                        filesToShare.push(file);
                    }

                    if (navigator.canShare && navigator.canShare({ files: filesToShare })) {
                        await navigator.share({
                            title: 'Fotos do Serviço - AirTech Pro',
                            text: `Registros fotográficos do cliente - ${client?.name}`,
                            files: filesToShare
                        });
                        if (isSelectionMode) {
                            setIsSelectionMode(false);
                            setSelectedPhotos(new Set());
                        }
                    } else {
                        alert('Seu dispositivo não suporta o envio direto de imagens pela web com esse navegador. Use a versão nativa ou envie uma por uma.');
                    }
                } else {
                    alert('Compartilhamento não suportado neste navegador.');
                }
            }
        } catch (error: any) {
            console.error("Erro ao compartilhar foto:", error);
            if (error.name !== "AbortError" && !error.message?.includes('canceled')) {
                alert("Não foi possível realizar o compartilhamento. Verifique se as imagens não são muito grandes.");
            }
        } finally {
            setIsSharingPhotos(false);
        }
    };

    const togglePhotoSelection = (photoId: string) => {
        const newSet = new Set(selectedPhotos);
        if (newSet.has(photoId)) {
            newSet.delete(photoId);
            if (newSet.size === 0) setIsSelectionMode(false);
        } else {
            newSet.add(photoId);
        }
        setSelectedPhotos(newSet);
    };

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedPhotos(new Set());
    };

    if (!client) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <p className="text-slate-500">Carregando cliente...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in text-base">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{client.name}</h1>
                        <p className="text-slate-500 text-sm">Detalhes do Cliente</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleDeleteClient}
                        className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-bold shadow-sm hover:bg-red-100 transition-all active:scale-95"
                    >
                        <Trash2 size={18} />
                        <span>Apagar</span>
                    </button>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                    >
                        <UserPlus size={18} className="text-blue-500" />
                        <span>Novo Cliente</span>
                    </button>
                </div>
            </div>

            {/* Client Info Card */}
            <div className="glass-panel p-6">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                        <User size={40} />
                    </div>
                    <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3 text-slate-600">
                            <Phone size={18} className="text-blue-500" />
                            <span>{client.phone}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600">
                            <MapPin size={18} className="text-red-500" />
                            <span>{client.address}</span>
                        </div>
                        {client.email && (
                            <div className="flex items-center gap-3 text-slate-600">
                                <span className="text-sm">✉️</span>
                                <span>{client.email}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto mt-4 md:mt-0">
                        <button
                            onClick={() => setIsStatementModalOpen(true)}
                            className="flex-1 sm:flex-none justify-center px-5 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-colors"
                            title="Gerar PDF de Débitos"
                        >
                            <FileText size={18} />
                            <span>Extrato</span>
                        </button>
                        <button
                            onClick={() => setIsEstimateModalOpen(true)}
                            className="flex-1 sm:flex-none justify-center px-5 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-xl shadow-sm flex items-center gap-2 hover:bg-blue-50 transition-colors"
                        >
                            <FileText size={18} />
                            <span>Orçamento</span>
                        </button>
                        <button
                            onClick={() => navigate('/services/new', { state: { clientId: client.id } })}
                            className="flex-1 sm:flex-none justify-center px-5 py-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={18} />
                            <span>Novo Serviço</span>
                        </button>
                    </div>
                </div>

                {/* Pending Debt Highlight Alert */}
                {services && services.filter(s => s.paymentStatus === 'Pendente').length > 0 && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border-l-4 border-red-500 gap-4">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-red-500 uppercase tracking-widest leading-tight">Não Pago</p>
                                <p className="text-xl font-bold text-red-700 dark:text-red-400">
                                    R$ {services.filter(s => s.paymentStatus === 'Pendente').reduce((acc, curr) => acc + curr.price, 0).toFixed(2)}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsStatementModalOpen(true)}
                            className="w-full sm:w-auto px-6 py-2 bg-red-600 text-white rounded-lg shadow-sm font-bold text-sm hover:bg-red-700 transition-colors"
                        >
                            Ver Débitos
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit">
                <button
                    onClick={() => setActiveTab('services')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all
                        ${activeTab === 'services'
                            ? 'bg-white text-blue-600 shadow-md'
                            : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Wrench size={18} />
                    Serviços
                </button>
                <button
                    onClick={() => setActiveTab('photos')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all
                        ${activeTab === 'photos'
                            ? 'bg-white text-blue-600 shadow-md'
                            : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <ImageIcon size={18} />
                    Catálogo de Fotos
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'services' ? (
                /* Services History */
                <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Wrench size={20} className="text-slate-500" />
                        Histórico de Serviços
                    </h2>

                    {!services || services.length === 0 ? (
                        <div className="glass-card p-8 text-center text-slate-500">
                            <p>Nenhum serviço registrado para este cliente.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {services.map((service: Service) => (
                                <div key={service.id} className="glass-card p-5 flex flex-col md:flex-row gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-2 gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-bold text-slate-800 text-lg break-words leading-tight">{service.type}</h3>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                                                {service.status === 'Concluído' && (
                                                    <button
                                                        onClick={() => handleViewReceipt(service)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold"
                                                        title="Gerar Recibo"
                                                    >
                                                        <FileText size={14} />
                                                        Recibo
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/services/${service.id}/edit`)}
                                                    className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold"
                                                    title="Editar Serviço"
                                                >
                                                    <Pencil size={14} />
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteService(service.id!)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold"
                                                    title="Apagar Serviço"
                                                >
                                                    <Trash2 size={14} />
                                                    Apagar
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mb-3">
                                            <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest
                                                ${service.status === 'Concluído' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                                                    service.status === 'Agendado' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                                                        'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'}`}>
                                                {service.status}
                                            </div>
                                            <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest
                                                ${service.paymentStatus === 'Pago' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                                                {service.paymentStatus === 'Pago' ? 'Pago' : 'Pendente'}
                                            </div>
                                        </div>
                                        <p className="text-slate-600 mb-3">{service.description}</p>

                                        {/* Service Items List */}
                                        {service.items && service.items.length > 0 && (
                                            <div className="mb-4 bg-slate-50/50 rounded-xl border border-slate-100 p-3">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Itens do Serviço</p>
                                                <div className="space-y-2">
                                                    {service.items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 text-[10px] shadow-sm">
                                                                    {item.quantity}x
                                                                </span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.type}</span>
                                                                {item.description && <span className="text-slate-400 italic font-medium ml-1">- {item.description}</span>}
                                                            </div>
                                                            <div className="font-black text-slate-900 dark:text-white">
                                                                R$ {(item.price * item.quantity).toFixed(2)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-4 text-sm text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <Calendar size={14} />
                                                <span>{formatLocalDate(service.date)}</span>
                                            </div>
                                            <div>
                                                Valor: <span className="font-semibold text-slate-700 dark:text-slate-300">R$ {service.price.toFixed(2)}</span>
                                            </div>
                                            {service.paymentMethod && (
                                                <div className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                                    {service.paymentMethod}
                                                </div>
                                            )}
                                            {service.paymentStatus === 'Pendente' && (
                                                <button
                                                    onClick={() => handleTogglePayment(service)}
                                                    className="ml-auto text-xs font-black text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-800/50"
                                                >
                                                    MARCAR COMO PAGO
                                                </button>
                                            )}
                                        </div>

                                        {/* Photos Comparison */}
                                        <div className="mt-4 space-y-4">
                                            {/* Before Photos */}
                                            {service.photosBefore && service.photosBefore.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-1">Antes</p>
                                                    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
                                                        {service.photosBefore.map((media, idx) => (
                                                            <div key={idx} onClick={() => setSelectedPhoto(media)} className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0 cursor-pointer shadow-sm active:scale-95 transition-transform bg-black">
                                                                {media.startsWith('data:video') ? (
                                                                    <video src={media} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <img src={media} alt="Antes" className="w-full h-full object-cover" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* After Photos */}
                                            {service.photosAfter && service.photosAfter.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest pl-1">Depois</p>
                                                    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
                                                        {service.photosAfter.map((media, idx) => (
                                                            <div key={idx} onClick={() => setSelectedPhoto(media)} className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0 cursor-pointer shadow-sm active:scale-95 transition-transform bg-black">
                                                                {media.startsWith('data:video') ? (
                                                                    <video src={media} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <img src={media} alt="Depois" className="w-full h-full object-cover" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Legacy Photos */}
                                            {service.photos && service.photos.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Geral</p>
                                                    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
                                                        {service.photos.map((media, idx) => (
                                                            <div key={idx} onClick={() => setSelectedPhoto(media)} className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0 cursor-pointer shadow-sm active:scale-95 transition-transform bg-black">
                                                                {media.startsWith('data:video') ? (
                                                                    <video src={media} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <img src={media} alt="Geral" className="w-full h-full object-cover" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* Photo Catalog */
                <div className="animate-fade-in relative">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <ImageIcon size={20} className="text-slate-500" />
                            {isSelectionMode ? `${selectedPhotos.size} selecionadas` : 'Todas as Fotos do Cliente'}
                        </h2>

                        <div className="flex gap-2">
                            {isSelectionMode ? (
                                <>
                                    <button
                                        onClick={toggleSelectionMode}
                                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        Cancelar
                                    </button>
                                    {selectedPhotos.size > 0 && (
                                        <button
                                            onClick={handleSharePhoto}
                                            disabled={isSharingPhotos}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {isSharingPhotos ? (
                                                <span className="animate-pulse">Gerando...</span>
                                            ) : (
                                                <>
                                                    <Share2 size={16} />
                                                    Compartilhar
                                                </>
                                            )}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    {services && services.some(s => s.photos?.length || s.photosBefore?.length || s.photosAfter?.length) && (
                                        <button
                                            onClick={toggleSelectionMode}
                                            className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                                        >
                                            Selecionar
                                        </button>
                                    )}
                                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-100 transition-all active:scale-95 cursor-pointer disabled:opacity-50">
                                        {isUploadingPhoto ? (
                                            <span className="animate-pulse">Enviando...</span>
                                        ) : (
                                            <>
                                                <Plus size={16} />
                                                Adicionar Foto
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            multiple
                                            className="hidden"
                                            disabled={isUploadingPhoto}
                                            onChange={handleCatalogPhotoUpload}
                                        />
                                    </label>
                                </>
                            )}
                        </div>
                    </div>

                    {(!services || services.every(s =>
                        (!s.photos || s.photos.length === 0) &&
                        (!s.photosBefore || s.photosBefore.length === 0) &&
                        (!s.photosAfter || s.photosAfter.length === 0)
                    )) ? (
                        <div className="glass-card p-12 text-center text-slate-500">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                                <ImageIcon size={32} />
                            </div>
                            <p>Nenhuma foto registrada para este cliente.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {services.reduce((acc: any[], service) => {
                                const before = (service.photosBefore || []).map((photo, idx) => ({
                                    url: photo,
                                    serviceType: service.type,
                                    date: service.date,
                                    label: 'Antes',
                                    color: 'bg-orange-500',
                                    id: `before-${service.id}-${idx}`
                                }));
                                const after = (service.photosAfter || []).map((photo, idx) => ({
                                    url: photo,
                                    serviceType: service.type,
                                    date: service.date,
                                    label: 'Depois',
                                    color: 'bg-emerald-500',
                                    id: `after-${service.id}-${idx}`
                                }));
                                const general = (service.photos || []).map((photo, idx) => ({
                                    url: photo,
                                    serviceType: service.type,
                                    date: service.date,
                                    label: 'Geral',
                                    color: 'bg-slate-500',
                                    id: `general-${service.id}-${idx}`
                                }));
                                return [...acc, ...before, ...after, ...general];
                            }, [])
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map((photoItem) => (
                                    <div
                                        key={photoItem.id}
                                        onClick={() => isSelectionMode ? togglePhotoSelection(photoItem.url) : setSelectedPhoto(photoItem.url)}
                                        className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all border-2 bg-black ${isSelectionMode && selectedPhotos.has(photoItem.url) ? 'border-blue-500 scale-95 opacity-90' : 'border-slate-100'}`}
                                    >
                                        {isSelectionMode && selectedPhotos.has(photoItem.url) && (
                                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-20 transition-all">
                                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg ring-4 ring-white">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                </div>
                                            </div>
                                        )}
                                        {photoItem.url.startsWith('data:video') ? (
                                            <video src={photoItem.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        ) : (
                                            <img
                                                src={photoItem.url}
                                                alt={photoItem.label}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            />
                                        )}
                                        {/* Label Badge */}
                                        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black text-white uppercase tracking-wider ${photoItem.color} shadow-sm z-10`}>
                                            {photoItem.label}
                                        </div>

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                            <p className="text-[10px] text-white/80 font-medium">{new Date(photoItem.date).toLocaleDateString('pt-BR')}</p>
                                            <p className="text-xs text-white font-bold">{photoItem.serviceType}</p>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Lightbox / Fullscreen Photo */}
            {selectedPhoto && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center animate-fade-in p-4"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <button
                        className="absolute top-6 left-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center gap-2"
                        onClick={(e) => { e.stopPropagation(); handleSharePhoto(); }}
                    >
                        <Share2 size={24} />
                    </button>

                    <button
                        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                        onClick={() => setSelectedPhoto(null)}
                    >
                        <X size={24} />
                    </button>
                    {selectedPhoto.startsWith('data:video') ? (
                        <video src={selectedPhoto} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl animate-scale-in" controls autoPlay onClick={(e) => e.stopPropagation()} />
                    ) : (
                        <img
                            src={selectedPhoto}
                            alt="Visualização"
                            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl animate-scale-in"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            )}

            {isFormOpen && (
                <ClientForm onClose={() => setIsFormOpen(false)} />
            )}

            {isReceiptOpen && selectedService && (
                <ReceiptModal
                    isOpen={isReceiptOpen}
                    onClose={() => setIsReceiptOpen(false)}
                    service={selectedService}
                    client={client}
                />
            )}

            {isEstimateModalOpen && (
                <EstimateModal
                    isOpen={isEstimateModalOpen}
                    onClose={() => setIsEstimateModalOpen(false)}
                    initialClient={client}
                />
            )}

            {isStatementModalOpen && client && (
                <DebtStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => setIsStatementModalOpen(false)}
                    client={client}
                    pendingServices={services?.filter(s => s.paymentStatus === 'Pendente') || []}
                />
            )}
        </div>
    );
}
