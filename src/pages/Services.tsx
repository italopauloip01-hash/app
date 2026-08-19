import { useState } from 'react';
import { Wrench, BookTemplate, Search, ChevronLeft, ChevronRight, DollarSign, User, Calendar, Pencil, Trash2, Users, TrendingUp, Download } from 'lucide-react';
import { ServiceTemplatesManager } from '../components/ServiceTemplatesManager';
import { useDetailedServices } from '../hooks/useData';
import { db } from '../db';
import { updateService, deleteService } from '../lib/supabaseOperations';
import { useNavigate } from 'react-router-dom';
import type { Service } from '../types';
import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatLocalDate, getYearMonth, getMonthName, getYearFromYearMonth } from '../utils/dateUtils';

export function Services() {
    const [activeTab, setActiveTab] = useState<'history' | 'templates'>('history');
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const navigate = useNavigate();
    const services = useDetailedServices() || [];
    const helperEntries = useLiveQuery(() => db.helperEntries.toArray()) || [];

    const handleDeleteService = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('Tem certeza que deseja apagar este serviço? Esta ação não pode ser desfeita.')) {
            try {
                await deleteService(id);
            } catch (error) {
                console.error("Error deleting service:", error);
            }
        }
    };

    const filteredServices = services.filter(s => {
        return getYearMonth(s.date) === selectedMonth;
    });

    const filteredHelperEntries = helperEntries.filter(e => {
        return getYearMonth(e.date) === selectedMonth && e.type === 'work';
    });

    const monthlyRevenue = filteredServices.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const monthlyHelperCost = filteredHelperEntries.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const netProfit = monthlyRevenue - monthlyHelperCost;

    const changeMonth = (months: number) => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const d = new Date(year, month - 1 + months, 1);
        setSelectedMonth(format(d, 'yyyy-MM'));
    };

    const handleTogglePayment = async (e: React.MouseEvent, service: Service) => {
        e.stopPropagation();
        const newStatus = service.paymentStatus === 'Pago' ? 'Pendente' : 'Pago';
        const method = newStatus === 'Pago' ? 'Pix' : undefined;

        try {
            await updateService(service.id!, {
                paymentStatus: newStatus,
                paymentMethod: method
            });
        } catch (error) {
            console.error("Error updating payment status:", error);
        }
    };

    const handleExportExcel = async () => {
        if (filteredServices.length === 0) {
            alert("Nenhum serviço neste período para exportar.");
            return;
        }

        const headers = ['Data', 'Cliente', 'Serviço', 'Valor', 'Status', 'Pagamento', 'Método', 'Observações'];

        const excelData = filteredServices.map(service => ({
            'Data': formatLocalDate(service.date),
            'Cliente': service.clientName || '',
            'Serviço': service.type || '',
            'Valor': service.price,
            'Status': service.status || '',
            'Pagamento': service.paymentStatus || '',
            'Método': service.paymentMethod || '',
            'Observações': service.description || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });

        // Ajustando a largura das colunas
        const colWidths = [
            { wch: 12 }, // Data
            { wch: 30 }, // Cliente
            { wch: 25 }, // Serviço
            { wch: 10 }, // Valor
            { wch: 15 }, // Status
            { wch: 15 }, // Pagamento
            { wch: 15 }, // Método
            { wch: 40 }  // Observações
        ];
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Serviços');

        const fileName = `servicos_${selectedMonth}.xlsx`;

        if (Capacitor.isNativePlatform()) {
            try {
                // Escreve o arquivo Excel em base64 para uso nativo
                const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                await Share.share({
                    title: 'Exportar Serviços em Excel',
                    text: `Planilha de serviços exportada do mês ${selectedMonth}`,
                    url: result.uri,
                    dialogTitle: 'Compartilhar Planilha'
                });
            } catch (error) {
                console.error("Erro ao exportar no app:", error);
                alert("Ocorreu um erro ao tentar compartilhar o arquivo Excel.");
            }
        } else {
            // Web fallback
            XLSX.writeFile(workbook, fileName);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Serviços</h1>
                    <p className="text-slate-500">Gerencie atendimentos e padrões</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/services/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95"
                    >
                        <Wrench size={16} />
                        Novo Serviço
                    </button>

                    <div className="flex bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm p-1 rounded-xl border border-white/20 dark:border-slate-700/50 shadow-sm">
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === 'history'
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            <Wrench size={16} />
                            Histórico
                        </button>
                        <button
                            onClick={() => setActiveTab('templates')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === 'templates'
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            <BookTemplate size={16} />
                            Padrões
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="space-y-6 animate-fade-in">
                    {/* Month Selector & Monthly Summary */}
                    <div className="flex flex-col gap-4">
                        <div className="glass-panel p-4 flex items-center justify-between">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                                <ChevronLeft size={20} />
                            </button>

                            <div className="flex flex-col items-center">
                                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider notranslate">
                                    {getYearFromYearMonth(selectedMonth)}
                                </span>
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white notranslate">
                                    {getMonthName(selectedMonth)}
                                </h2>
                            </div>

                            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400 dark:border-blue-500/50 shadow-lg rounded-2xl p-3 sm:p-4 text-white flex items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <DollarSign size={20} className="sm:w-6 sm:h-6" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-blue-50 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-shadow-sm">Faturamento</p>
                                    <h3 className="text-lg sm:text-xl font-black truncate drop-shadow-md">R$ {monthlyRevenue.toFixed(2)}</h3>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-red-500 to-red-600 border border-red-400 dark:border-red-500/50 shadow-lg rounded-2xl p-3 sm:p-4 text-white flex items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <Users size={20} className="sm:w-6 sm:h-6" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-red-50 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-shadow-sm">Custos</p>
                                    <h3 className="text-lg sm:text-xl font-black truncate drop-shadow-md">R$ {monthlyHelperCost.toFixed(2)}</h3>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-400 dark:border-emerald-500/50 shadow-lg rounded-2xl p-3 sm:p-4 text-white flex items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <TrendingUp size={20} className="sm:w-6 sm:h-6" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-emerald-50 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-shadow-sm">Lucro Real</p>
                                    <h3 className="text-lg sm:text-xl font-black truncate drop-shadow-md">R$ {netProfit.toFixed(2)}</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Services List */}
                    <div className="glass-panel overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300">Serviços do Mês</h3>
                            <div className="flex items-center gap-3 space-x-2">
                                <button
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                                    title="Exportar para Excel (XLSX)"
                                >
                                    <Download size={14} className="text-emerald-500" />
                                    Excel
                                </button>
                                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">
                                    {filteredServices.length} atendimentos
                                </span>
                            </div>
                        </div>

                        {filteredServices.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 mx-auto mb-4">
                                    <Search size={32} />
                                </div>
                                <p className="text-slate-500 dark:text-slate-400">Nenhum serviço registrado neste mês.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredServices.map((service) => (
                                    <div
                                        key={service.id}
                                        onClick={() => navigate(`/clients/${service.clientId}`)}
                                        className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                                    >
                                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold flex-shrink-0">
                                                <Wrench size={16} className="sm:w-[18px]" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">{service.type}</h4>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                                        <User size={14} className="flex-shrink-0" />
                                                        <span className="truncate">{service.clientName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                        <Calendar size={14} className="text-blue-400" />
                                                        <span className="font-medium">{formatLocalDate(service.date).substring(0, 5)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full sm:w-auto mt-2 sm:mt-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800/50 min-w-0">
                                            <div className="text-left sm:text-right flex flex-col sm:items-end gap-0.5 min-w-0 flex-shrink">
                                                <p className="font-bold text-slate-800 dark:text-white tracking-tight text-[13px] sm:text-base truncate">R$ {service.price.toFixed(2)}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                                                        ${service.paymentStatus === 'Pago' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                                                        {service.paymentStatus === 'Pago' ? 'Pago' : 'Pendente'}
                                                    </span>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-widest">{service.status}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                                {service.paymentStatus === 'Pendente' && (
                                                    <button
                                                        onClick={(e) => handleTogglePayment(e, service)}
                                                        className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-100 dark:border-emerald-800/50 shadow-sm"
                                                        title="Marcar como Pago"
                                                    >
                                                        <DollarSign size={15} className="sm:w-[16px]" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/services/${service.id}/edit`);
                                                    }}
                                                    className="p-1.5 sm:p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
                                                    title="Editar Serviço"
                                                >
                                                    <Pencil size={15} className="sm:w-[16px]" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteService(e, service.id!)}
                                                    className="p-1.5 sm:p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-100 dark:border-red-900/50 shadow-sm"
                                                    title="Apagar Serviço"
                                                >
                                                    <Trash2 size={15} className="sm:w-[16px]" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <ServiceTemplatesManager />
            )}
        </div>
    );
}
