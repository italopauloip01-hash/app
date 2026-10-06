import { useState, useEffect } from 'react';
import { Save, Building2, Smartphone, MapPin, CreditCard, Mail, User, FileJson, Download, Upload, CheckCircle2, Signature, Trash2, PenLine, Users, Plus, Cloud, RefreshCw } from 'lucide-react';
import { useSettings, useHelpers } from '../hooks/useData';
import { addHelper, deleteHelper, saveSettings, syncDatabase } from '../lib/supabaseOperations';
import { exportDatabase, importDatabase } from '../utils/backup';
import { APP_VERSION } from '../version';
import type { Helper } from '../types';
import { Capacitor } from '@capacitor/core';
import { SignaturePad } from '../components/SignaturePad';
import { processSignaturePhoto } from '../utils/signature';
import { toError } from '../lib/utils';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { InstallAppModal } from '../components/InstallAppModal';

const isNativeApp = Capacitor.isNativePlatform();

export function Settings() {
    const settings = useSettings();
    const helpers = useHelpers();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [pixKey, setPixKey] = useState('');
    const [address, setAddress] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [email, setEmail] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [signature, setSignature] = useState<string | undefined>(undefined);
    const [signatureMode, setSignatureMode] = useState<'draw' | null>(null);
    const [isProcessingSignature, setIsProcessingSignature] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const { canInstall, isIOS, promptInstall, showInstructions, setShowInstructions } = usePWAInstall();

    // New Helper state
    const [newHelperName, setNewHelperName] = useState('');
    const [newHelperPhone, setNewHelperPhone] = useState('');

    const handleAddHelper = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHelperName.trim()) return;

        try {
            await addHelper({
                name: newHelperName.trim(),
                phone: newHelperPhone.trim(),
                active: true
            });
            setNewHelperName('');
            setNewHelperPhone('');
        } catch (error) {
            console.error('Failed to add helper:', error);
        }
    };

    const handleDeleteHelper = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja remover este ajudante?')) return;
        try {
            await deleteHelper(id);
        } catch (error) {
            console.error('Failed to delete helper:', error);
        }
    };

    useEffect(() => {
        if (settings && !isLoaded) {
            setName(settings.name || '');
            setPhone(settings.phone || '');
            setPixKey(settings.pixKey || '');
            setAddress(settings.address || '');
            setCnpj(settings.cnpj || '');
            setEmail(settings.email || '');
            setOwnerName(settings.ownerName || '');
            setAutoBackupEnabled(settings.autoBackupEnabled || false);
            setDarkMode(settings.darkMode || false);
            setSignature(settings.signature);
            setIsLoaded(true);
        }
    }, [settings, isLoaded]);

    const handleToggleAutoBackup = async (enabled: boolean) => {
        setAutoBackupEnabled(enabled);
        try {
            const dataToSave = {
                name,
                phone,
                pixKey,
                address,
                cnpj,
                email,
                ownerName: ownerName || '',
                autoBackupEnabled: enabled,
                darkMode,
                signature
            };
            await saveSettings({ ...settings, ...dataToSave });
        } catch (error) {
            console.error('Failed to update auto backup:', error);
        }
    };

    // A assinatura é salva na hora (não depende do botão "Salvar" do formulário)
    const handleSignatureChange = async (value: string | undefined) => {
        setSignature(value);
        try {
            await saveSettings({ ...settings, name, phone, pixKey, address, cnpj, email, ownerName, autoBackupEnabled, darkMode, signature: value });
        } catch (error) {
            console.error('Failed to save signature:', error);
            alert('Erro ao salvar a assinatura');
        }
    };

    const handleToggleDarkMode = async (enabled: boolean) => {
        setDarkMode(enabled);
        try {
            const dataToSave = {
                name,
                phone,
                pixKey,
                address,
                cnpj,
                email,
                ownerName: ownerName || '',
                autoBackupEnabled,
                darkMode: enabled,
                signature
            };
            await saveSettings({ ...settings, ...dataToSave });
        } catch (error) {
            console.error('Failed to update dark mode:', error);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveSettings({
                ...settings,
                name,
                phone,
                pixKey,
                address,
                cnpj,
                email,
                ownerName,
                autoBackupEnabled,
                darkMode,
                signature
            });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Erro ao salvar configurações');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await syncDatabase({ fullPhotos: true }); // manual: confere também todas as fotos
            if (result.ok) {
                alert("Sincronização com a nuvem concluída com sucesso!");
            } else if (result.reason === 'offline') {
                alert(`Sem internet. ${result.pending} alteração(ões) serão enviadas quando a conexão voltar.`);
            } else if (result.reason === 'busy') {
                alert("Já existe uma sincronização em andamento. Aguarde alguns segundos.");
            } else {
                alert(`A sincronização não foi concluída. ${result.pending} alteração(ões) ainda aguardam envio; o app tentará novamente.`);
            }
        } catch (error) {
            console.error('Falha na sincronização:', error);
            alert("Erro ao sincronizar dados. Verifique sua conexão.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const success = await exportDatabase();
            if (success) {
                alert("Backup exportado com sucesso!");
            } else {
                alert("O backup não foi salvo (erro ou compartilhamento cancelado).");
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (window.confirm("Atenção: Importar dados irá substituir todos os dados atuais. Deseja continuar?")) {
            try {
                await importDatabase(file);
                alert("Dados importados com sucesso!");
                window.location.reload();
            } catch (error) {
                console.error('Falha ao importar backup:', error);
                alert("Erro ao importar dados. Verifique o arquivo.");
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Configurações</h1>
                <p className="text-slate-500 dark:text-slate-400">Gerencie as informações da sua empresa e segurança de dados</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Section 1: Company Profile */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                                <Building2 size={24} />
                                <h2 className="text-xl font-bold uppercase tracking-tight">Perfil da Empresa</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Building2 size={14} /> Nome da Empresa
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="Ex: AirTech Refrigeração"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <User size={14} /> Nome do Responsável
                                    </label>
                                    <input
                                        type="text"
                                        value={ownerName}
                                        onChange={(e) => setOwnerName(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="Seu nome completo"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Smartphone size={14} /> Telefone / WhatsApp
                                    </label>
                                    <input
                                        type="text"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Mail size={14} /> E-mail de Contato
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="contato@empresa.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Payments & Legal */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-2">
                                <CreditCard size={24} />
                                <h2 className="text-xl font-bold uppercase tracking-tight">Finanças e Legal</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <CreditCard size={14} /> Chave PIX para Recebimento
                                    </label>
                                    <input
                                        type="text"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="CPF, E-mail, Celular ou Aleatória"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        CNPJ / CPF (Opcional)
                                    </label>
                                    <input
                                        type="text"
                                        value={cnpj}
                                        onChange={(e) => setCnpj(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="00.000.000/0000-00"
                                    />
                                </div>

                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <MapPin size={14} /> Endereço Comercial
                                    </label>
                                    <input
                                        type="text"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="Rua, Número, Bairro, Cidade - UF"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2.5: Digital Signature */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-2">
                                <Signature size={24} />
                                <h2 className="text-xl font-bold uppercase tracking-tight">Assinatura Digital</h2>
                            </div>

                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400 text-sm">
                                    Esta assinatura será exibida no final dos recibos e extratos de cobrança.
                                </p>

                                {signatureMode === 'draw' ? (
                                    <SignaturePad
                                        onSave={(dataUrl) => { handleSignatureChange(dataUrl); setSignatureMode(null); }}
                                        onCancel={() => setSignatureMode(null)}
                                    />
                                ) : signature ? (
                                    <div className="space-y-3">
                                        {/* Fundo quadriculado mostra que a assinatura tem fundo transparente */}
                                        <div className="w-full max-w-sm h-32 rounded-xl border-2 border-slate-100 dark:border-slate-700 flex items-center justify-center p-4 bg-white bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]">
                                            <img src={signature} alt="Assinatura" className="max-w-full max-h-full object-contain" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setSignatureMode('draw')} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                                                REFAZER
                                            </button>
                                            <button type="button" onClick={() => handleSignatureChange(undefined)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100">
                                                <Trash2 size={14} /> REMOVER
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                                        <button
                                            type="button"
                                            onClick={() => setSignatureMode('draw')}
                                            className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all"
                                        >
                                            <PenLine className="w-7 h-7" />
                                            <span className="text-xs font-bold uppercase tracking-widest">Desenhar</span>
                                            <span className="text-[10px] text-slate-400">Assine com o dedo</span>
                                        </button>
                                        <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl cursor-pointer text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all">
                                            {isProcessingSignature ? <RefreshCw className="w-7 h-7 animate-spin" /> : <Upload className="w-7 h-7" />}
                                            <span className="text-xs font-bold uppercase tracking-widest">{isProcessingSignature ? 'Processando' : 'Enviar foto'}</span>
                                            <span className="text-[10px] text-slate-400 text-center px-2">Assinatura em papel branco</span>
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                disabled={isProcessingSignature}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    e.target.value = '';
                                                    if (!file) return;
                                                    setIsProcessingSignature(true);
                                                    try {
                                                        handleSignatureChange(await processSignaturePhoto(file));
                                                    } catch (err) {
                                                        alert(toError(err).message);
                                                    } finally {
                                                        setIsProcessingSignature(false);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                )}                            </div>
                        </div>

                        {/* Section 2.6: Team Management */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                                <Users size={24} />
                                <h2 className="text-xl font-bold uppercase tracking-tight">Gerenciar Equipe</h2>
                            </div>

                            <form onSubmit={handleAddHelper} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nome do Ajudante/Técnico</label>
                                        <input
                                            type="text"
                                            value={newHelperName}
                                            onChange={(e) => setNewHelperName(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 transition-all outline-none font-medium dark:text-white"
                                            placeholder="Ex: João Silva"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Telefone (Opcional)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newHelperPhone}
                                                onChange={(e) => setNewHelperPhone(e.target.value)}
                                                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 transition-all outline-none font-medium dark:text-white"
                                                placeholder="(00) 00000-0000"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddHelper}
                                                className="px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95"
                                            >
                                                <Plus size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>

                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Membros da Equipe</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {helpers?.map((helper: Helper) => (
                                        <div key={helper.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl group">
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-100">{helper.name}</p>
                                                {helper.phone && <p className="text-xs text-slate-500 dark:text-slate-400">{helper.phone}</p>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => helper.id && handleDeleteHelper(helper.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!helpers || helpers.length === 0) && (
                                        <div className="sm:col-span-2 py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                                            <Users className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum ajudante cadastrado</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Backup & Security */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3 text-amber-600 dark:text-amber-50">
                                    <FileJson size={24} />
                                    <h2 className="text-xl font-bold uppercase tracking-tight">Backup e Segurança</h2>
                                </div>

                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 sm:gap-6">
                                    {/* Dark Mode Toggle */}
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            Modo Escuro
                                        </span>
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={darkMode}
                                                onChange={(e) => handleToggleDarkMode(e.target.checked)}
                                            />
                                            <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </div>
                                    </label>

                                    {/* Auto Backup Toggle (só no app: o navegador não grava arquivo sozinho) */}
                                    {isNativeApp && (
                                    <label className="flex items-center gap-3 cursor-pointer group" title="Salva em Documentos/AirTechPro, mantendo os 5 mais recentes">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            Backup Auto (3h)
                                        </span>
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={autoBackupEnabled}
                                                onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                                            />
                                            <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        </div>
                                    </label>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900 space-y-3">
                                    <div className="flex items-center gap-3 text-amber-700 dark:text-amber-300">
                                        <Download size={24} />
                                        <div>
                                            <p className="font-bold text-sm">EXPORTAR BACKUP</p>
                                            <p className="text-[10px] opacity-80">Gera um arquivo com todos os seus dados</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isExporting && <RefreshCw size={14} className="animate-spin" />}
                                        {isExporting ? 'GERANDO BACKUP...' : 'BAIXAR ARQUIVO DE BACKUP'}
                                    </button>
                                </div>

                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                                    <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                        <Upload size={24} />
                                        <div>
                                            <p className="font-bold text-sm">IMPORTAR DADOS</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Restaura dados de um arquivo de backup</p>
                                        </div>
                                    </div>
                                    <label className="block">
                                        <span className="sr-only">Escolher arquivo</span>
                                        <input
                                            type="file"
                                            accept=".json"
                                            onChange={handleImport}
                                            className="block w-full text-xs text-slate-500 dark:text-slate-400
                                            file:mr-4 file:py-2 file:px-4
                                            file:rounded-xl file:border-0
                                            file:text-xs file:font-bold
                                            file:bg-slate-200 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-200
                                            hover:file:bg-slate-300
                                            cursor-pointer"
                                        />
                                    </label>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium text-center">
                                Recomendamos fazer um backup semanal para garantir a segurança dos seus dados. O arquivo gerado pode ser lido de volta pelo aplicativo em qualquer dispositivo.
                            </p>
                        </div>

                        {/* Section 4: Cloud Sync */}
                        <div className="glass-panel p-6 sm:p-8 space-y-6">
                            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                                <Cloud size={24} />
                                <h2 className="text-xl font-bold uppercase tracking-tight">Nuvem e Sincronização</h2>
                            </div>

                            <div className="flex flex-col md:flex-row gap-6 items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-100">Sincronização com Supabase</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Forçar envio e recebimento manual de todos os dados entre seu dispositivo e o banco de dados na nuvem.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-blue-600 dark:text-blue-400 rounded-xl font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
                                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                                </button>
                            </div>
                        </div>

                        {/* Section 5: Mobile App Install */}
                        {canInstall && (
                            <div className="glass-panel p-6 sm:p-8 space-y-6 border-2 border-blue-500/20">
                                <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                                    <Smartphone size={24} />
                                    <h2 className="text-xl font-bold uppercase tracking-tight">Aplicativo no Celular</h2>
                                </div>

                                <div className="flex flex-col md:flex-row gap-6 items-center justify-between p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50">
                                    <div>
                                        <p className="font-bold text-slate-800 dark:text-slate-100">Instalar na Tela Inicial</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Instale o AirTech Pro para abrir como app nativo, sem as barras do navegador e com acesso instantâneo offline.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={promptInstall}
                                        className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                                    >
                                        <Download size={18} />
                                        <span>Instalar Aplicativo</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Submit Section */}
                        <div className="pt-6 flex items-center justify-between gap-4">
                            <div className={`flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold transition-all duration-500 ${showSuccess ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                                <CheckCircle2 size={20} />
                                <span>Configurações salvas!</span>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50 font-bold"
                            >
                                <Save size={20} />
                                <span>{isSaving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
                    AirTech Pro • Aplicativo de Gestão para Climatização
                </p>
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        Versão {APP_VERSION} (Produção PWA)
                    </span>
                </div>
            </div>

            <InstallAppModal
                isOpen={showInstructions}
                onClose={() => setShowInstructions(false)}
                isIOS={isIOS}
            />
        </div>
    );
}
