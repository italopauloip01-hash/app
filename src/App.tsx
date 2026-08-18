import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Clients } from './pages/Clients';
import { ClientDetails } from './pages/ClientDetails';
import { NewService } from './pages/NewService';
import { Services } from './pages/Services';
import { Settings } from './pages/Settings';
import { Helpers } from './pages/Helpers';
import { Estimates } from './pages/Estimates';
import { Login } from './pages/Login';
import { AutoBackupManager } from './components/AutoBackupManager';
import { useSettings } from './hooks/useData';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';


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
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetails />} />
              <Route path="settings" element={<Settings />} />
              <Route path="helpers" element={<Helpers />} />
              <Route path="reminders" element={<Dashboard />} />
              <Route path="services" element={<Services />} />
              <Route path="estimates" element={<Estimates />} />
              <Route path="services/new" element={<NewService />} />
              <Route path="services/:id/edit" element={<NewService />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
