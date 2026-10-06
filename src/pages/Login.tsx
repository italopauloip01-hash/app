import { toError } from '../lib/utils';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Auto-redirect if user gets authenticated successfully
    useEffect(() => {
        if (user) {
            navigate('/', { replace: true });
        }
    }, [user, navigate]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            if (isSignUp) {
                if (password !== confirmPassword) {
                    setError("As senhas não coincidem. Tente novamente.");
                    setLoading(false);
                    return;
                }

                if (password.length < 6) {
                    setError("A senha deve ter pelo menos 6 caracteres.");
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (error) {
                    // Translate common Supabase Auth errors to Portuguese
                    let errorMessage = "Erro ao criar conta.";
                    if (error.message.includes("User already registered")) {
                        errorMessage = "Este e-mail já está cadastrado.";
                    }
                    setError(errorMessage);
                    return;
                }

                if (data?.session) {
                    setSuccessMsg("Conta criada com sucesso!");
                } else if (data?.user && !data?.user.confirmed_at) {
                    setSuccessMsg("Conta criada! Se a confirmação estiver ativada, verifique sua caixa de entrada.");
                    setIsSignUp(false);
                } else {
                    setSuccessMsg("Conta criada com sucesso! Por favor, faça login.");
                    setIsSignUp(false);
                }
                setPassword(''); // clear password for safety
                setConfirmPassword('');
                setShowPassword(false);
                setShowConfirmPassword(false);
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    // Translate common Supabase Auth errors to Portuguese
                    let errorMessage = "Erro ao fazer login. Verifique suas credenciais.";
                    if (error.message.includes("Invalid login credentials")) {
                        errorMessage = "E-mail ou senha incorretos.";
                    } else if (error.message.includes("Email not confirmed")) {
                        errorMessage = "E-mail ainda não confirmado. Verifique seu e-mail para ativar sua conta.";
                    }
                    setError(errorMessage);
                    return;
                }

                // Removed manual navigate('/') to prevent Race Condition
                // The useEffect will handle the redirect once AuthContext updates
            }
        } catch (caught) {
            const err = toError(caught);
            setError(err.message || "Erro inesperado ao realizar autenticação.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-8 pb-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-center">
                    <img src="/favicon.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-[22%] shadow-xl shadow-black/20 ring-1 ring-white/20" />
                    <h1 className="text-2xl font-bold tracking-tight">AirTech Pro</h1>
                    <p className="text-blue-100 text-sm mt-1">Gestão inteligente para técnicos</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleAuth} className="space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400">
                                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                <p className="text-sm font-medium">{error}</p>
                            </div>
                        )}

                        {successMsg && (
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl flex items-start gap-3 text-emerald-600 dark:text-emerald-400">
                                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                <p className="text-sm font-medium">{successMsg}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                                E-mail de Acesso
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail size={18} className="text-slate-400" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                                Senha
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={18} className="text-slate-400" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                                    tabIndex={-1}
                                    aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {isSignUp && (
                            <div className="space-y-2 animate-fade-in">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                                    Confirmar Senha
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock size={18} className="text-slate-400" />
                                    </div>
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        required={!!isSignUp}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-0 transition-all outline-none font-medium dark:text-white"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                                        tabIndex={-1}
                                        aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Ver confirmação de senha"}
                                    >
                                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/30 active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <LogIn size={20} />
                                    <span>{isSignUp ? 'CRIAR CONTA' : 'ENTRAR NO SISTEMA'}</span>
                                </>
                            )}
                        </button>

                        <div className="text-center pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setError(null);
                                    setSuccessMsg(null);
                                    setPassword('');
                                    setConfirmPassword('');
                                    setShowPassword(false);
                                    setShowConfirmPassword(false);
                                }}
                                className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                            >
                                {isSignUp ? 'Já possui conta? Faça login' : 'Criar nova conta'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
