import { useState, useMemo } from 'react';
import { Search, Plus, Phone, MapPin, ChevronRight, UserX, AlertCircle, Send, FileText, Trash2 } from 'lucide-react';
import { useClients, useServices } from '../hooks/useData';
import { deleteClient, deleteService } from '../lib/supabaseOperations';
import { ClientForm } from '../components/ClientForm';
import { DebtStatementModal } from '../components/DebtStatementModal';
import { GlobalDebtStatementModal } from '../components/GlobalDebtStatementModal';
import { EstimateModal } from '../components/EstimateModal';
import { useNavigate } from 'react-router-dom';
import type { Client, Service } from '../types';
import { formatWhatsAppNumber } from '../utils/phoneUtils';
import { formatSimpleDate, getServicePrice } from '../utils/dateUtils';

export function Clients() {
    const clients = useClients();
    const allServices = useServices();
    const navigate = useNavigate();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);

    // PDF Statement State
    const [selectedClientForStatement, setSelectedClientForStatement] = useState<Client | null>(null);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [isGlobalStatementOpen, setIsGlobalStatementOpen] = useState(false);
    const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);
    const [selectedClientForEstimate, setSelectedClientForEstimate] = useState<Client | null>(null);

    // Calculate debt per client - memoized to avoid recalculating on every render
    const clientDebts = useMemo(() => {
        const map = new Map<string, number>();
        allServices?.forEach((s: Service) => {
            if (s.paymentStatus === 'Pendente' && s.status !== 'Cancelado') {
                const current = map.get(s.clientId) || 0;
                map.set(s.clientId, current + getServicePrice(s));
            }
        });
        return map;
    }, [allServices]);

    // Calculate global total debt - memoized
    const totalGlobalDebt = useMemo(() => {
        let total = 0;
        clientDebts.forEach((debt) => { total += debt; });
        return total;
    }, [clientDebts]);

    const filteredClients = useMemo(() => clients?.filter(client =>
        (client.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (client.phone?.includes(searchTerm) || false) ||
        (client.address?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    ), [clients, searchTerm]);

    const handleEdit = (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        setEditingClient(client);
        setIsFormOpen(true);
    };

    const handleAddNew = () => {
        setEditingClient(undefined);
        setIsFormOpen(true);
    };

    const handleDelete = async (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        if (window.confirm(`Tem certeza que deseja apagar o cliente ${client.name} e todos os seus serviços?`)) {
            try {
                const clientServices = allServices?.filter((s: Service) => s.clientId === client.id) || [];
                for (const s of clientServices) {
                    await deleteService(s.id!);
                }
                await deleteClient(client.id!);
            } catch (error) {
                console.error("Error deleting client:", error);
                alert("Erro ao apagar cliente.");
            }
        }
    };

    const handleSendCharge = (e: React.MouseEvent, client: Client, totalDebt: number) => {
        e.stopPropagation();

        const pendingServices = allServices?.filter(s => s.clientId === client.id && s.paymentStatus === 'Pendente' && s.status !== 'Cancelado') || [];

        let message = `*FrioTech Soluções - Lembrete de Pagamento* ❄️💰\n\n`;
        message += `Olá, *${client.name}*!\n`;
        message += `Passando para lembrar dos seguintes serviços pendentes:\n\n`;

        pendingServices.forEach(s => {
            message += `• ${formatSimpleDate(s.date)} - ${s.type}: *R$ ${getServicePrice(s).toFixed(2)}*\n`;
        });

        message += `\n*Total em Aberto: R$ ${(Number(totalDebt) || 0).toFixed(2)}*\n\n`;
        message += `Ficamos no aguardo. Obrigado pelo contato!`;

        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${formatWhatsAppNumber(client.phone)}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleOpenStatement = (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        setSelectedClientForStatement(client);
        setIsStatementModalOpen(true);
    };

    const handleOpenEstimate = (e: React.MouseEvent, client: Client) => {
        e.stopPropagation();
        setSelectedClientForEstimate(client);
        setIsEstimateModalOpen(true);
    };

    if (clients === undefined) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Clientes</h1>
                    <p className="text-slate-500">Gerencie sua base de clientes</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                >
                    <Plus size={20} />
                    <span>Novo Cliente</span>
                </button>
            </div>

            <div className="glass-panel p-4 flex items-center gap-4">
                <Search className="text-slate-400" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, telefone ou endereço..."
                    className="flex-1 bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
            </div>

            {totalGlobalDebt > 0 && (
                <div className="bg-gradient-to-br from-red-500 to-red-600 border border-red-400 dark:border-red-500/50 shadow-lg rounded-2xl p-4 text-white flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={24} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-red-50 text-[10px] font-bold uppercase tracking-wider text-shadow-sm">Total de Débitos Pendentes (Geral)</p>
                        <h3 className="text-2xl font-black truncate drop-shadow-md">R$ {(Number(totalGlobalDebt) || 0).toFixed(2)}</h3>
                    </div>
                    <button
                        onClick={() => setIsGlobalStatementOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-white text-sm font-bold shadow-sm transition-all"
                    >
                        <FileText size={18} />
                        <span className="hidden sm:inline">Relatório</span>
                        <span className="sm:hidden">PDF</span>
                    </button>
                </div>
            )}

            {clients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <UserX size={40} />
                    </div>
                    <p className="text-lg font-medium">Nenhum cliente cadastrado.</p>
                    <p className="text-sm">Clique em "Novo Cliente" para começar.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClients?.map((client) => (
                        <div
                            key={client.id}
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="glass-card p-6 flex flex-col gap-4 cursor-pointer group border border-transparent hover:border-blue-200"
                        >
                            <div className="flex items-start justify-between">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md group-hover:scale-110 transition-transform">
                                    {client.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleOpenEstimate(e, client)}
                                        className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors"
                                        title="Gerar Orçamento"
                                    >
                                        <FileText size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => handleEdit(e, client)}
                                        className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors"
                                        title="Editar Cliente"
                                    >
                                        <span className="sr-only">Editar</span>
                                        <div className="w-6 h-6 flex items-center justify-center font-bold pb-2">...</div>
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, client)}
                                        className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"
                                        title="Apagar Cliente"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{client.name}</h3>
                                <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                                    <MapPin size={14} className="flex-shrink-0" />
                                    <span className="truncate">{client.address}</span>
                                </div>

                                {clientDebts.get(client.id!) && clientDebts.get(client.id!)! > 0 && (
                                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between bg-red-50 dark:bg-red-900/20 p-2 rounded-xl border border-red-100 dark:border-red-900/20 gap-2 sm:gap-0">
                                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 truncate">
                                            <AlertCircle size={14} className="flex-shrink-0" />
                                            <span className="text-xs font-black uppercase tracking-tight truncate">DÉBITO: R$ {(Number(clientDebts.get(client.id!)) || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                            <button
                                                onClick={(e) => handleOpenStatement(e, client)}
                                                className="flex-1 sm:flex-none p-1.5 justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 text-[10px] font-bold"
                                                title="Gerar PDF de Débitos"
                                            >
                                                <FileText size={12} />
                                                PDF
                                            </button>
                                            <button
                                                onClick={(e) => handleSendCharge(e, client, clientDebts.get(client.id!)!)}
                                                className="flex-1 sm:flex-none p-1.5 justify-center bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all active:scale-95 shadow-sm flex items-center gap-1.5 text-[10px] font-bold"
                                                title="Enviar Cobrança via WhatsApp"
                                            >
                                                <Send size={12} />
                                                COBRAR
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 mt-auto border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <a
                                    href={`tel:${client.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                >
                                    <Phone size={16} />
                                    <span>{client.phone}</span>
                                </a>
                                <ChevronRight size={20} className="text-slate-300 dark:text-slate-700 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isFormOpen && (
                <ClientForm
                    onClose={() => setIsFormOpen(false)}
                    clientToEdit={editingClient}
                />
            )}
            {isStatementModalOpen && selectedClientForStatement && (
                <DebtStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => setIsStatementModalOpen(false)}
                    client={selectedClientForStatement}
                    pendingServices={allServices?.filter(s => s.clientId === selectedClientForStatement.id && s.paymentStatus === 'Pendente') || []}
                />
            )}
            {isGlobalStatementOpen && clients && allServices && (
                <GlobalDebtStatementModal
                    isOpen={isGlobalStatementOpen}
                    onClose={() => setIsGlobalStatementOpen(false)}
                    clients={clients}
                    allServices={allServices}
                />
            )}
            {isEstimateModalOpen && (
                <EstimateModal
                    isOpen={isEstimateModalOpen}
                    onClose={() => {
                        setIsEstimateModalOpen(false);
                        setSelectedClientForEstimate(null);
                    }}
                    initialClient={selectedClientForEstimate || undefined}
                />
            )}
        </div>
    );
}
