import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { subscribeToRealtime, unsubscribeFromRealtime } from '../lib/supabaseOperations';

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

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch current session
        const initAuth = async () => {
            // Delaying loading state briefly so that UX doesn't blink if it evaluates to fast
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user || null;
            setSession(session);
            setUser(currentUser);
            setLoading(false);

            if (currentUser) {
                subscribeToRealtime(currentUser.id);
            }
        };

        // If the process fails, unblock the user immediately
        initAuth().catch(() => setLoading(false));

        // Listen for Auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const currentUser = session?.user || null;
            setSession(session);
            setUser(currentUser);
            setLoading(false);

            if (currentUser) {
                subscribeToRealtime(currentUser.id);
            } else {
                unsubscribeFromRealtime();
            }
        });

        return () => {
            subscription.unsubscribe();
            unsubscribeFromRealtime();
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    const value = useMemo(() => ({
        user,
        session,
        loading,
        signOut
    }), [user, session, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
