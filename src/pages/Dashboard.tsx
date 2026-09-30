import { useState } from 'react';
import { Wrench, Users, Calendar, ArrowUpRight, AlertTriangle, Check, X, RotateCcw, Ban, type LucideIcon } from 'lucide-react';
import { useDashboardStats, useReminders, useCompanyName } from '../hooks/useData';
import { useNavigate } from 'react-router-dom';
import { formatWhatsAppNumber } from '../utils/phoneUtils';
import { formatLocalDate, formatSimpleDate, parseLocalDate } from '../utils/dateUtils';
import { updateService } from '../lib/supabaseOperations';

interface StatCardProps {
    title: string;
    value: string | number;
    trend?: string | null;
    icon: LucideIcon;
    color: string;
    onClick?: () => void;
}

type ReminderItem = NonNullable<ReturnType<typeof useReminders>>[number];

const StatCard = ({ title, value, trend, icon: Icon, color, onClick }: StatCardProps) => (
    <div
        onClick={onClick}
        className={`glass-card p-6 relative overflow-hidden group transition-all duration-300 ${onClick ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-1 active:scale-[0.98]' : ''}`}
    >
        <div className={`absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-opacity ${color}`}>
            <Icon size={64} />
        </div>
        <div className="relative z-10">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color} bg-opacity-10 text-white shadow-sm`}>
                <Icon size={24} className="text-current" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{title}</p>
            <h3 className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{value}</h3>
            {trend && (
                <div className="flex items-center gap-1 mt-2 text-sm text-green-600 dark:text-green-400 font-medium">
                    <ArrowUpRight size={16} />
                    <span>{trend}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">vs mês passado</span>
                </div>
            )}
        </div>
    </div>
);

export function Dashboard() {
    const navigate = useNavigate();
    const stats = useDashboardStats();
    const companyName = useCompanyName();
    const reminders = useReminders(false) || [];
    const ignoredReminders = useReminders(true) || [];
    const [maintenanceWindow, setMaintenanceWindow] = useState(30);
    const [showIgnored, setShowIgnored] = useState(false);

    if (!stats) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    // Active reminders
    const urgentReminders = reminders?.filter(r => r.daysRemaining <= 7);
    const upcomingServices = showIgnored 
        ? ignoredReminders 
        : reminders?.filter(r => r.daysRemaining <= maintenanceWindow);

    const windowOptions = [
        { label: '7 dias', value: 7 },
        { label: '15 dias', value: 15 },
        { label: '30 dias', value: 30 },
        { label: '2 meses', value: 60 },
        { label: '3 meses', value: 90 },
        { label: '6 meses', value: 180 },
    ];

    const revenueTrend = stats.lastMonthRevenue > 0
        ? `${(((stats.currentRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100).toFixed(0)}%`
        : null;

    const helperTrend = stats.lastMonthHelperCost > 0
        ? `${(((stats.currentHelperCost - stats.lastMonthHelperCost) / stats.lastMonthHelperCost) * 100).toFixed(0)}%`
        : null;

    const handleMarkAsRealized = async (e: React.MouseEvent, service: ReminderItem) => {
        e.stopPropagation();

        if (service.isReminder) {
            navigate('/services/new', {
                state: {
                    clientId: service.clientId,
                    isMaintenance: true,
                    prefillItems: service.items || [{
                        type: service.type,
                        description: `Manutenção periódica - ${service.type}`,
                        quantity: 1,
                        price: service.price || 0
                    }]
                }
            });
        } else {
            try {
                await updateService(service.id!, {
                    status: 'Concluído',
                    date: new Date()
                });
            } catch (error) {
                console.error("Error marking service as realized:", error);
            }
        }
    };

    const handleIgnoreReminder = async (e: React.MouseEvent, service: ReminderItem) => {
        e.stopPropagation();
        if (window.confirm(`Deseja marcar este serviço de ${service.clientName} como "Não Realizar"? Ele sairá dos alertas.`)) {
            try {
                await updateService(service.id!, {
                    reminderIgnored: true,
                    reminderIgnoredAt: new Date(),
                    ...(service.status === 'Agendado' ? { status: 'Cancelado' } : {})
                });
            } catch (error) {
                console.error("Error ignoring reminder:", error);
            }
        }
    };

    const handleRestoreReminder = async (e: React.MouseEvent, service: ReminderItem) => {
        e.stopPropagation();
        try {
            await updateService(service.id!, {
                reminderIgnored: false,
                reminderIgnoredAt: undefined,
                ...(service.status === 'Cancelado' ? { status: 'Agendado' } : {})
            });
        } catch (error) {
            console.error("Error restoring reminder:", error);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in text-base pb-10">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard
                    title="Serviços Realizados"
                    value={stats.servicesCount || 0}
                    icon={Wrench}
                    color="bg-blue-500 text-blue-600"
                    onClick={() => navigate('/services')}
                />
                <StatCard
                    title="Clientes Ativos"
                    value={stats.clientsCount || 0}
                    icon={Users}
                    color="bg-purple-500 text-purple-600"
                    onClick={() => navigate('/clients')}
                />
                <StatCard
                    title="Lembretes Pendentes"
                    value={reminders?.length || 0}
                    icon={Calendar}
                    color="bg-orange-500 text-orange-600"
                    onClick={() => navigate('/services')}
                />
                <StatCard
                    title="Gasto Ajudantes"
                    value={`R$ ${(stats.currentHelperCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    trend={helperTrend}
                    icon={Users}
                    color="bg-red-500 text-red-600"
                    onClick={() => navigate('/helpers')}
                />
                <StatCard
                    title="Receita Estimada"
                    value={`R$ ${(stats.currentRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    trend={revenueTrend}
                    icon={ArrowUpRight}
                    color="bg-green-500 text-green-600"
                    onClick={() => navigate('/services')}
                />
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Upcoming Maintenance List */}
                    <div className="glass-panel p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Calendar className={showIgnored ? "text-red-500" : "text-blue-500"} size={20} />
                                    {showIgnored ? 'Serviços Ignorados / Não Realizar' : 'Próximas Manutenções'}
                                </h3>
                                {ignoredReminders.length > 0 && (
                                    <button
                                        onClick={() => setShowIgnored(!showIgnored)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                            showIgnored 
                                                ? 'bg-red-500 text-white shadow-md' 
                                                : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-100'
                                        }`}
                                    >
                                        <Ban size={12} />
                                        <span>{showIgnored ? 'Ver Pendentes' : `Não Realizar (${ignoredReminders.length})`}</span>
                                    </button>
                                )}
                            </div>

                            {!showIgnored && (
                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                                    {windowOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setMaintenanceWindow(opt.value)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all
                                                ${maintenanceWindow === opt.value
                                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                                            `}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {!upcomingServices || upcomingServices.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                                <p>
                                    {showIgnored 
                                        ? 'Nenhum serviço marcado como "Não Realizar".' 
                                        : `Nenhuma manutenção agendada para ${maintenanceWindow >= 60 ? `os próximos ${maintenanceWindow / 30} meses` : `os próximos ${maintenanceWindow} dias`}.`}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {upcomingServices.map((service) => (
                                    <div key={service.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer group" onClick={() => navigate(`/clients/${service.clientId}`)}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors
                                                ${showIgnored
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                    : service.isReminder
                                                        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 group-hover:bg-orange-600 group-hover:text-white'
                                                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white'}
                                            `}>
                                                {parseLocalDate(service.displayDate).getDate()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-slate-800 dark:text-white">{service.type}</h4>
                                                    {service.isReminder && (
                                                        <span className="text-[8px] font-black bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-1 rounded">MANUTENÇÃO</span>
                                                    )}
                                                    {showIgnored && (
                                                        <span className="text-[8px] font-black bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1 rounded">IGNORADO</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{service.clientName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                                    ${service.daysRemaining < 0
                                                        ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                                        : service.daysRemaining <= 7
                                                            ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}
                                                `}>
                                                    {service.daysRemaining < 0
                                                        ? `Atrasado ${Math.abs(service.daysRemaining)}d`
                                                        : service.daysRemaining === 0
                                                            ? 'Hoje'
                                                            : `Em ${service.daysRemaining} dias`}
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-medium">
                                                    {formatSimpleDate(service.displayDate)}
                                                </span>
                                            </div>
                                            
                                            {showIgnored ? (
                                                <button
                                                    onClick={(e) => handleRestoreReminder(e, service)}
                                                    className="p-2 ml-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all active:scale-95 border border-blue-200 dark:border-blue-800/50 shadow-sm"
                                                    title="Reativar Manutenção"
                                                >
                                                    <RotateCcw size={18} />
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => handleMarkAsRealized(e, service)}
                                                        className="p-2 ml-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all active:scale-95 border border-emerald-100 dark:border-emerald-800/50 shadow-sm"
                                                        title="Marcar como Realizado"
                                                    >
                                                        <Check size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleIgnoreReminder(e, service)}
                                                        className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-all active:scale-95 border border-red-100 dark:border-red-800/50 shadow-sm"
                                                        title="Não Realizar / Ignorar"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Service Type Breakdown & Top Activity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Service Breakdown */}
                        <div className="glass-panel p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-widest text-blue-600 dark:text-blue-400">Tipos de Serviço</h3>
                                <button
                                    onClick={() => navigate('/services')}
                                    className="text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest"
                                >
                                    Ver Tudo
                                </button>
                            </div>
                            <div className="space-y-4">
                                {stats.serviceTypeBreakdown.length === 0 ? (
                                    <p className="text-slate-400 dark:text-slate-600 text-xs italic">Nenhum dado disponível.</p>
                                ) : (
                                    stats.serviceTypeBreakdown.map((item) => {
                                        const total = stats.servicesCount || 1;
                                        const percentage = ((item.value / total) * 100).toFixed(0);
                                        return (
                                            <div key={item.label} className="space-y-1">
                                                <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                                    <span>{item.label}</span>
                                                    <span>{item.value} ({percentage}%)</span>
                                                </div>
                                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-1000"
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="glass-panel p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-widest text-purple-600 dark:text-purple-400">Atividade Recente</h3>
                                <button
                                    onClick={() => navigate('/services')}
                                    className="text-[10px] font-black text-slate-400 hover:text-purple-600 transition-colors uppercase tracking-widest"
                                >
                                    Ver Tudo
                                </button>
                            </div>
                            <div className="space-y-4">
                                {stats.recentServices.length === 0 ? (
                                    <p className="text-slate-400 dark:text-slate-600 text-xs italic">Nenhum serviço recente.</p>
                                ) : (
                                    stats.recentServices.map((service) => (
                                        <div key={service.id} className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                                                <Wrench size={14} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{service.clientName}</p>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{service.type} • {formatLocalDate(service.date)}</p>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                R$ {(Number(service.price) || 0).toFixed(2)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar area */}
                <div className="space-y-6">
                    {/* Urgent Section */}
                    <div className="glass-panel p-6 border-l-4 border-orange-400 dark:border-orange-500">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className="text-orange-500" size={20} />
                            Urgente (Vence em 7 dias)
                        </h3>
                        <div className="space-y-4">
                            {!urgentReminders || urgentReminders.length === 0 ? (
                                <p className="text-slate-400 dark:text-slate-600 text-sm italic">Nenhum serviço vencendo nesta semana.</p>
                            ) : (
                                urgentReminders.map((reminder) => (
                                    <div key={reminder.id} className="p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 group">
                                        <div className="flex items-center gap-2 mb-2 text-orange-700 dark:text-orange-400 font-bold text-[10px] uppercase tracking-wider">
                                            <Calendar size={12} />
                                            <span>{reminder.daysRemaining <= 0 ? 'Atrasado' : `Em ${reminder.daysRemaining} dias`}</span>
                                        </div>
                                        <p className="text-sm text-slate-800 dark:text-white font-bold mb-1">{reminder.type}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{reminder.clientName}</p>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => handleMarkAsRealized(e, reminder)}
                                                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95 text-center flex items-center justify-center gap-1 uppercase"
                                            >
                                                <Check size={14} />
                                                Realizado
                                            </button>
                                            <a
                                                href={`https://wa.me/${formatWhatsAppNumber(reminder.clientPhone)}?text=${encodeURIComponent(`Olá ${reminder.clientName}, aqui é da ${companyName}. Sua manutenção de ar condicionado está vencendo. Vamos agendar?`)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3 py-2 bg-green-500 text-white rounded-lg text-[10px] font-black shadow-lg shadow-green-500/20 hover:bg-green-600 transition-all active:scale-95 text-center flex items-center justify-center gap-1 uppercase"
                                                title="WhatsApp"
                                            >
                                                Zap
                                            </a>
                                            <button
                                                onClick={(e) => handleIgnoreReminder(e, reminder)}
                                                className="px-2.5 py-2 bg-red-50 dark:bg-red-950/40 text-red-500 hover:text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/50 rounded-lg hover:bg-red-100 transition-all active:scale-95"
                                                title="Não Realizar / Ignorar"
                                            >
                                                <X size={14} />
                                            </button>
                                            <button
                                                onClick={() => navigate(`/clients/${reminder.clientId}`)}
                                                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 uppercase"
                                            >
                                                Ver
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
