import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AutoBackupManager } from './components/AutoBackupManager';
import { useSettings } from './hooks/useData';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Cada tela é baixada só quando aberta: o app abre mais rápido no celular
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Clients = lazy(() => import('./pages/Clients').then(m => ({ default: m.Clients })));
const ClientDetails = lazy(() => import('./pages/ClientDetails').then(m => ({ default: m.ClientDetails })));
const NewService = lazy(() => import('./pages/NewService').then(m => ({ default: m.NewService })));
const Services = lazy(() => import('./pages/Services').then(m => ({ default: m.Services })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Helpers = lazy(() => import('./pages/Helpers').then(m => ({ default: m.Helpers })));
const Estimates = lazy(() => import('./pages/Estimates').then(m => ({ default: m.Estimates })));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const page = (element: React.ReactNode) => <Suspense fallback={<PageLoader />}>{element}</Suspense>;

function App() {
  const settings = useSettings();

  useEffect(() => {
    if (settings?.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.darkMode]);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AutoBackupManager />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={page(<Dashboard />)} />
              <Route path="clients" element={page(<Clients />)} />
              <Route path="clients/:id" element={page(<ClientDetails />)} />
              <Route path="settings" element={page(<Settings />)} />
              <Route path="helpers" element={page(<Helpers />)} />
              <Route path="reminders" element={page(<Dashboard />)} />
              <Route path="services" element={page(<Services />)} />
              <Route path="estimates" element={page(<Estimates />)} />
              <Route path="services/new" element={page(<NewService />)} />
              <Route path="services/:id/edit" element={page(<NewService />)} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
