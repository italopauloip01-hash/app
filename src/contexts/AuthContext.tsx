import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { ensureLocalDataOwner, subscribeToRealtime, syncDatabase, unsubscribeFromRealtime } from '../lib/supabaseOperations';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    signOut: async () => { },
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const user = session?.user ?? null;
    const userId = user?.id;

    useEffect(() => {
        supabase.auth.getSession()
            .then(({ data }) => setSession(data.session))
            .finally(() => setLoading(false));

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Um único ponto que inicia/encerra a sincronização. Depende só do id do usuário,
    // para não reiniciar a cada renovação de token.
    useEffect(() => {
        if (!userId) {
            unsubscribeFromRealtime();
            return;
        }

        let cancelled = false;
        (async () => {
            await ensureLocalDataOwner(userId);
            if (cancelled) return;
            subscribeToRealtime(userId);
            await syncDatabase();
        })().catch(err => console.error('Falha ao iniciar sincronização:', err));

        return () => {
            cancelled = true;
            unsubscribeFromRealtime();
        };
    }, [userId]);

    const value = useMemo(() => ({
        user,
        session,
        loading,
        signOut: async () => {
            await supabase.auth.signOut();
        },
    }), [user, session, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
