import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jlikmlezsfexjbchbqmb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsaWttbGV6c2ZleGpiY2hicW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NjQyNzYsImV4cCI6MjA4NzA0MDI3Nn0.YJDtKvpIAgeiRTh3CbCaZiEk4dBkxlzyFcOeRU_-LSQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        }
    },
    global: {
        headers: { 'x-application-name': 'airtech-pro' }
    }
});
