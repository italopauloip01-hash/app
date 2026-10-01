import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus, User, MapPin } from 'lucide-react';
import { addMonths, format, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDetailedServices, useServiceTemplates, useSettings, useClients } from '../hooks/useData';
import { saveSettings } from '../lib/supabaseOperations';
import {
    DEFAULT_WORK_END, DEFAULT_WORK_START, bookedMinutes, dayBlocks, dayKey, formatDuration,
    freeRanges, fromMinutes, serviceDuration, suggestSlots, toMinutes,
} from '../utils/schedule';
import { MONTH_NAMES_PT } from '../utils/dateUtils';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// "segunda-feira, 5 de outubro" -> "Segunda-feira, 5 de outubro" (CSS capitalize deixaria "De")
const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Agenda() {
    const navigate = useNavigate();
    const servicesData = useDetailedServices();
    const templatesData = useServiceTemplates();
    const clientsData = useClients();
    const services = useMemo(() => servicesData ?? [], [servicesData]);
    const templates = useMemo(() => templatesData ?? [], [templatesData]);
    const clients = useMemo(() => clientsData ?? [], [clientsData]);
    const settings = useSettings();
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [selected, setSelected] = useState(() => new Date());

    const workStart = settings?.workStart || DEFAULT_WORK_START;
    const workEnd = settings?.workEnd || DEFAULT_WORK_END;
    const capacity = Math.max(60, toMinutes(workEnd) - toMinutes(workStart));

    const clientAddress = useMemo(() => new Map(clients.map(c => [c.id!, c.address])), [clients]);

    // Dias visíveis no calendário (semanas completas)
    const days = useMemo(() => eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
    }), [month]);

    // Ocupação por dia (só serviços com horário entram na conta de tempo)
    const loadByDay = useMemo(() => {
        const map = new Map<string, { booked: number; count: number }>();
        for (const day of days) {
            const key = format(day, 'yyyy-MM-dd');
            const count = services.filter(s => s.status !== 'Cancelado' && dayKey(s.date) === key).length;
            map.set(key, { booked: bookedMinutes(dayBlocks(services, key, templates)), count });
        }
        return map;
    }, [days, services, templates]);

    const selectedKey = format(selected, 'yyyy-MM-dd');
    const blocks = dayBlocks(services, selectedKey, templates);
    const withoutTime = services.filter(s => !s.startTime && s.status !== 'Cancelado' && dayKey(s.date) === selectedKey);
    const free = freeRanges(blocks, workStart, workEnd);
    const booked = bookedMinutes(blocks);
    const nextSlot = suggestSlots(blocks, 60, workStart, workEnd)[0];

    const schedule = (startTime?: string) =>
        navigate('/services/new', { state: { date: selectedKey, startTime, fromAgenda: true } });

    const saveWorkHours = (start: string, end: string) => {
        if (!start || !end || toMinutes(end) <= toMinutes(start)) return;
        saveSettings({ ...settings!, workStart: start, workEnd: end });
    };

    const loadColor = (ratio: number) =>
        ratio >= 0.85 ? 'bg-red-500' : ratio >= 0.5 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <CalendarDays className="text-blue-600" />
                        Agenda
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Veja o tempo ocupado em cada dia antes de marcar</p>
                </div>
                <div className="flex items-center gap-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
                    <Clock size={16} className="text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">Expediente</span>
                    <input type="time" value={workStart} onChange={e => saveWorkHours(e.target.value, workEnd)}
                        className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 outline-none" />
                    <span className="text-slate-400">às</span>
                    <input type="time" value={workEnd} onChange={e => saveWorkHours(workStart, e.target.value)}
                        className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 outline-none" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Calendário do mês */}
                <div className="lg:col-span-3 glass-panel p-4">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setMonth(m => addMonths(m, -1))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Mês anterior">
                            <ChevronLeft size={20} />
                        </button>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white notranslate">
                            {MONTH_NAMES_PT[month.getMonth()]} {month.getFullYear()}
                        </h2>
                        <button onClick={() => setMonth(m => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Próximo mês">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center">
                        {WEEKDAYS.map(d => (
                            <div key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
                        ))}
                        {days.map(day => {
                            const key = format(day, 'yyyy-MM-dd');
                            const load = loadByDay.get(key)!;
                            const inMonth = day.getMonth() === month.getMonth();
                            const isSelected = isSameDay(day, selected);
                            const isToday = isSameDay(day, new Date());
                            const ratio = load.booked / capacity;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setSelected(day)}
                                    className={`relative flex flex-col items-center justify-start gap-1 rounded-xl py-2 min-h-[60px] transition-all
                                        ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}
                                        ${!inMonth && !isSelected ? 'opacity-35' : ''}`}
                                >
                                    <span className={`text-sm font-bold ${isToday && !isSelected ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                        {day.getDate()}
                                    </span>
                                    {load.count > 0 && (
                                        <span className={`text-[10px] font-bold ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {load.count} serv.
                                        </span>
                                    )}
                                    {load.booked > 0 && (
                                        <span className={`absolute bottom-1.5 left-2 right-2 h-1 rounded-full ${isSelected ? 'bg-white/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                            <span className={`block h-full rounded-full ${loadColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Tranquilo</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Metade do dia</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Cheio</span>
                    </div>
                </div>

                {/* Dia selecionado */}
                <div className="lg:col-span-2 glass-panel p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white notranslate">
                                {capitalizeFirst(format(selected, "EEEE, d 'de' MMMM", { locale: ptBR }))}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {formatDuration(booked)} ocupadas de {formatDuration(capacity)}
                            </p>
                        </div>
                        <button
                            onClick={() => schedule(nextSlot)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all shrink-0"
                        >
                            <Plus size={16} /> Agendar
                        </button>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className={`h-full ${loadColor(booked / capacity)}`} style={{ width: `${Math.min(100, (booked / capacity) * 100)}%` }} />
                    </div>

                    {blocks.length === 0 && withoutTime.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">Nenhum serviço neste dia.</p>
                    )}

                    <div className="space-y-2">
                        {blocks.map(b => (
                            <button
                                key={b.service.id}
                                onClick={() => navigate(`/services/${b.service.id}/edit`)}
                                className="w-full text-left flex gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
                            >
                                <div className="text-center shrink-0 w-14">
                                    <p className="text-sm font-black text-blue-600 dark:text-blue-400">{fromMinutes(b.start)}</p>
                                    <p className="text-[10px] text-slate-400">até {fromMinutes(b.end)}</p>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-800 dark:text-white truncate">{b.service.type}</p>
                                    <p className="text-xs text-slate-500 flex items-center gap-1 truncate"><User size={12} /> {b.service.clientName}</p>
                                    {clientAddress.get(b.service.clientId) && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1 truncate"><MapPin size={12} /> {clientAddress.get(b.service.clientId)}</p>
                                    )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 h-fit shrink-0">
                                    {formatDuration(b.end - b.start)}
                                </span>
                            </button>
                        ))}
                    </div>

                    {free.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Horários livres</p>
                            <div className="flex flex-wrap gap-2">
                                {free.map(r => (
                                    <button
                                        key={r.start}
                                        onClick={() => schedule(fromMinutes(r.start))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                        title="Agendar neste horário"
                                    >
                                        {fromMinutes(r.start)} – {fromMinutes(r.end)} ({formatDuration(r.end - r.start)})
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-400">Já considera 30 min de deslocamento entre um cliente e outro.</p>
                        </div>
                    )}

                    {withoutTime.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Sem horário definido</p>
                            {withoutTime.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => navigate(`/services/${s.id}/edit`)}
                                    className="w-full text-left flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/40 text-sm"
                                >
                                    <span className="truncate"><b>{s.type}</b> · {s.clientName}</span>
                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0">~{formatDuration(serviceDuration(s, templates))}</span>
                                </button>
                            ))}
                            <p className="text-[11px] text-slate-400">Toque para definir o horário. Sem horário, o serviço não entra na conta do dia.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
