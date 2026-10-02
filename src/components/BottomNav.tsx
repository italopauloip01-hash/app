import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Plus, Wrench, Users, type LucideIcon } from 'lucide-react';

interface Tab {
    to: string;
    label: string;
    icon: LucideIcon;
    isActive: (path: string) => boolean;
}

const TABS: Tab[] = [
    { to: '/', label: 'Início', icon: LayoutDashboard, isActive: p => p === '/' },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays, isActive: p => p === '/agenda' },
    { to: '/services', label: 'Serviços', icon: Wrench, isActive: p => p === '/services' },
    { to: '/clients', label: 'Clientes', icon: Users, isActive: p => p.startsWith('/clients') },
];

/**
 * Navegação fixa embaixo, só no celular (ao alcance do polegar). O botão do meio cria
 * um serviço. Orçamentos, Ajudantes e Configurações ficam no menu ☰ do topo.
 */
export function BottomNav() {
    const { pathname } = useLocation();

    // Nas telas de formulário a barra esconde, para não cobrir o botão de salvar
    if (pathname.startsWith('/services/new') || pathname.endsWith('/edit')) return null;

    const renderTab = (tab: Tab) => {
        const active = tab.isActive(pathname);
        const Icon = tab.icon;
        return (
            <Link
                key={tab.to}
                to={tab.to}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-[11px] font-semibold transition-colors
                    ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
            >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                {tab.label}
            </Link>
        );
    };

    return (
        <nav
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            aria-label="Navegação principal"
        >
            <div className="flex items-end px-1">
                {TABS.slice(0, 2).map(renderTab)}
                <div className="flex-1 flex justify-center">
                    <Link
                        to="/services/new"
                        aria-label="Novo serviço"
                        className="-mt-5 w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 active:scale-95 transition-transform"
                    >
                        <Plus size={28} strokeWidth={2.5} />
                    </Link>
                </div>
                {TABS.slice(2).map(renderTab)}
            </div>
        </nav>
    );
}
