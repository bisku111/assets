import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase, creato solo se la configurazione c'è.
 *
 * L'assenza di configurazione NON è un errore: è la modalità locale,
 * in cui l'app funziona lo stesso con il catalogo dimostrativo e i
 * progressi sul dispositivo. Serve a poter provare l'MVP subito dopo il
 * clone, senza creare prima un progetto.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'));

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createClient(url as string, anonKey as string, {
      auth: {
        // Su mobile non c'è un URL da cui leggere il token di ritorno.
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cached;
}
