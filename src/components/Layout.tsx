import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSettings, DEFAULT_COMPANY_NAME } from '../hooks/useData';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard,
    Users,
    Wrench,
    Settings,
    Menu,
    X,
    Bell,
    LogOut,
    FileText,
    CalendarDays,
    type LucideIcon
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { syncDatabase, onSyncStateChange, subscribeToRealtime } from '../lib/supabaseOperations';
import { OfflineIndicator } from './OfflineIndicator';
import { APP_VERSION } from '../version';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

const NavItem = ({ to, icon: Icon, label, active, onClick }: { to: string, icon: LucideIcon, label: string, active: boolean, onClick?: () => void }) => (
    <Link
        to={to}
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group
      ${active
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-blue-600 dark:hover:text-blue-400'
            }`}
    >
        <Icon className={`w-5 h-5 ${active ? 'text-white' : 'group-hover:text-blue-600 dark:group-hover:text-blue-400'}`} />
        <span className="font-medium">{label}</span>
    </Link>
);

export function Layout() {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const location = useLocation();
    const navigate = useNavigate();
    const settings = useSettings();
    const { user, signOut } = useAuth();

    const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    // A sincronização inicial e o realtime são iniciados no AuthContext.
    // Aqui só reagimos a voltar a ficar online.
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (user) {
                subscribeToRealtime(user.id);
                syncDatabase();
            }
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const unsubscribeSync = onSyncStateChange((state) => {
            setIsSyncing(state);
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            unsubscribeSync();
        }
    }, [user]);

    const companyName = settings?.name?.trim() || DEFAULT_COMPANY_NAME;

    return (
        <div className="flex min-h-screen relative overflow-x-hidden w-full">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 
        bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-r border-white/20 dark:border-slate-800 shadow-2xl
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/favicon.svg" alt="" className="w-10 h-10 shrink-0 shadow-lg shadow-blue-900/30 rounded-[22%]" />
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-400">
                            {companyName}
                        </h1>
                    </div>
                    <button onClick={toggleSidebar} className="lg:hidden text-slate-400 hover:text-slate-600 dark:text-slate-500 hover:dark:text-slate-300">
                        <X size={24} />
                    </button>
                </div>

                <nav className="p-4 space-y-2">
                    <p className="px-4 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{companyName}</p>
                    <NavItem to="/" icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/'} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/clients" icon={Users} label="Clientes" active={location.pathname.startsWith('/clients')} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/agenda" icon={CalendarDays} label="Agenda" active={location.pathname === '/agenda'} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/services" icon={Wrench} label="Serviços" active={location.pathname.startsWith('/services')} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/estimates" icon={FileText} label="Orçamentos" active={location.pathname.startsWith('/estimates')} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/helpers" icon={Users} label="Ajudantes" active={location.pathname.startsWith('/helpers')} onClick={() => setSidebarOpen(false)} />
                    <NavItem to="/settings" icon={Settings} label="Configurações" active={location.pathname === '/settings'} onClick={() => setSidebarOpen(false)} />
                </nav>

                <div className="absolute bottom-0 w-full p-6 bg-gradient-to-t from-white/90 dark:from-slate-900 via-white/50 dark:via-slate-900/50 to-transparent">
                    <div className="glass-card p-4 rounded-xl border border-white/50 dark:border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">
                                    {user?.email ? user.email.split('@')[0] : 'Técnico'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Online</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                            title="Sair do sistema"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                    <div className="text-[10px] text-center text-slate-400 dark:text-slate-500 font-mono mt-3">
                        AirTech Pro • <span className="font-bold text-blue-500">v{APP_VERSION}</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative max-w-full min-w-0 overflow-x-hidden">
                <OfflineIndicator />
                {/* Header */}
                <header className="sticky top-0 z-30 px-3 py-3 lg:px-6 lg:py-4 glass-panel m-2 mt-3 mb-0 lg:m-4 flex items-center justify-between shadow-sm overflow-hidden min-w-0">
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                    >
                        <Menu size={24} />
                    </button>

                    <div className="flex items-center gap-2 lg:ml-0 ml-2 truncate">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white truncate">
                            {location.pathname === '/settings' ? 'Configurações' :
                                location.pathname === '/clients' ? 'Clientes' :
                                    location.pathname === '/services' ? 'Serviços' :
                                        location.pathname === '/helpers' ? 'Ajudantes' :
                                            location.pathname === '/estimates' ? 'Orçamentos' :
                                                location.pathname === '/agenda' ? 'Agenda' : 'Visão Geral'}
                        </h2>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                            v{APP_VERSION}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Sync Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/50">
                            {isSyncing ? (
                                <>
                                    <RefreshCw size={14} className="text-blue-500 animate-spin" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden md:inline">Sincronizando...</span>
                                </>
                            ) : !isOnline ? (
                                <>
                                    <WifiOff size={14} className="text-red-500" />
                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest hidden md:inline">Offline</span>
                                </>
                            ) : (
                                <>
                                    <Wifi size={14} className="text-emerald-500" />
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hidden md:inline">Online</span>
                                </>
                            )}
                        </div>

                        <button
                            onClick={() => alert('Você não possui novas notificações no momento.')}
                            className="p-2 relative rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                        >
                            <Bell size={20} />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white dark:ring-slate-900 shadow-md">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-2 sm:p-4 lg:p-8 pb-32 lg:pb-40 space-y-6 max-w-full min-w-0">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
