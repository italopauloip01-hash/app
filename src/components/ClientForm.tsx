import { Capacitor } from '@capacitor/core';
import { toError } from '../lib/utils';
import { useState, useEffect } from 'react';
import { X, Save, User, Phone, MapPin, Mail, LocateFixed, Loader2 } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { addClient, updateClient, deleteClient, deleteService } from '../lib/supabaseOperations';
import { useServices } from '../hooks/useData';
import type { Client, Service } from '../types';

interface ClientFormProps {
    onClose: () => void;
    clientToEdit?: Client;
}

export function ClientForm({ onClose, clientToEdit }: ClientFormProps) {
    const allServices = useServices();
    const [isLocating, setIsLocating] = useState(false);
    const [formData, setFormData] = useState<Omit<Client, 'id' | 'createdAt'>>({
        name: '',
        phone: '',
        address: '',
        email: '',
    });

    useEffect(() => {
        if (clientToEdit) {
            setFormData({
                name: clientToEdit.name,
                phone: clientToEdit.phone,
                address: clientToEdit.address,
                email: clientToEdit.email || '',
            });
        }
    }, [clientToEdit]);

    const handleGetLocation = async () => {
        setIsLocating(true);
        try {
            // Check if we are running in Capacitor (app) or web
            const isNative = Capacitor.isNativePlatform();

            let latitude, longitude;

            if (isNative) {
                // Request permissions natively via Capacitor
                const permissions = await Geolocation.checkPermissions();
                if (permissions.location !== 'granted' && permissions.location !== 'prompt') {
                    throw new Error("Permissão de localização foi negada permanentemente.");
                }

                if (permissions.location !== 'granted') {
                    const request = await Geolocation.requestPermissions();
                    if (request.location !== 'granted') {
                        throw new Error("Permissão de localização negada.");
                    }
                }

                const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
                latitude = position.coords.latitude;
                longitude = position.coords.longitude;
            } else {
                // Web fallback
                if (!navigator.geolocation) {
                    throw new Error("Geolocalização não é suportada pelo seu navegador.");
                }
                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
                });
                latitude = position.coords.latitude;
                longitude = position.coords.longitude;
            }

            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
            );
            const data = await response.json();

            if (data && data.address) {
                const { road, pedestrian, path, residential, house_number, suburb, neighbourhood, city_district, city, town, village, municipality, state } = data.address;
                const street = road || pedestrian || path || residential || '';
                const number = house_number ? `, ${house_number}` : ', S/N';
                const neighborhood = suburb || neighbourhood || city_district || '';
                const cityName = city || town || village || municipality || '';

                const neighborhoodStr = neighborhood ? ` - ${neighborhood}` : '';
                const fullAddress = `${street}${street ? number : ''}${neighborhoodStr}, ${cityName} - ${state}`;
                setFormData(prev => ({ ...prev, address: fullAddress.trim() }));
            }
        } catch (caught) {
            const error = toError(caught);
            console.error("Error fetching location/address:", error);
            alert(error.message || "Erro ao buscar endereço. Verifique as permissões de localização ou tente digitar manualmente.");
        } finally {
            setIsLocating(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (clientToEdit && clientToEdit.id) {
                await updateClient(clientToEdit.id, formData);
            } else {
                await addClient({
                    ...formData,
                    createdAt: new Date(),
                });
            }
            onClose();
        } catch (error) {
            console.error("Failed to save client:", error);
            alert("Erro ao salvar cliente. Verifique os dados.");
        }
    };

    const handleDelete = async () => {
        if (!clientToEdit || !clientToEdit.id) return;

        if (window.confirm(`Tem certeza absoluta que deseja apagar o cliente ${clientToEdit.name} e TODOS os seus serviços? Esta ação não pode ser desfeita.`)) {
            try {
                const clientServices = allServices?.filter((s: Service) => s.clientId === clientToEdit.id) || [];
                for (const s of clientServices) {
                    await deleteService(s.id!);
                }
                await deleteClient(clientToEdit.id);
                // Also optionally navigate to /clients if we are unmounting ClientDetails,
                // but since the component just unmounts, handling the routing isn't easily done here.
                // However, removing the client from DB will auto-update useClients hook.
                onClose();
                window.location.href = '/clients'; // Force redirect to clients list to prevent errors
            } catch (error) {
                console.error("Error deleting client:", error);
                alert("Erro ao apagar cliente.");
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md my-8 animate-scale-in flex flex-col max-h-[90vh] border border-transparent dark:border-slate-800">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                    <h2 className="text-lg font-bold text-slate-800">
                        {clientToEdit ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <button
                        onClick={onClose}
                        type="button"
                        className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <User size={16} className="text-blue-500" />
                            Nome Completo
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            placeholder="Ex: João Silva"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Phone size={16} className="text-green-500" />
                            Telefone / WhatsApp
                        </label>
                        <input
                            type="tel"
                            required
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            placeholder="(00) 00000-0000"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <MapPin size={16} className="text-red-500" />
                                Endereço
                            </label>
                            <button
                                type="button"
                                onClick={handleGetLocation}
                                disabled={isLocating}
                                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg"
                            >
                                {isLocating ? (
                                    <Loader2 size={12} className="animate-spin" />
                                ) : (
                                    <LocateFixed size={12} />
                                )}
                                {isLocating ? 'Buscando...' : 'Puxar Localização (GPS)'}
                            </button>
                        </div>
                        <textarea
                            required
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
                            placeholder="Rua, Número, Bairro, Cidade"
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Mail size={16} className="text-purple-500" />
                            Email (Opcional)
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            placeholder="cliente@email.com"
                        />
                    </div>

                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                        {clientToEdit && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors border border-red-100"
                            >
                                Excluir Cliente
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
