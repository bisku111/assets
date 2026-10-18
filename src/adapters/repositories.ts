import type { AuthPort, CatalogPort, ProgressPort } from '../core/ports/repository';
import { asyncStorageStore } from './storage/asyncStorageStore';
import { LocalAuth, LocalCatalog, LocalProgress } from './storage/localRepository';
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client';
import { SupabaseAuth, SupabaseCatalog, SupabaseProgress } from './supabase/repository';

/**
 * Sceglie l'implementazione dei dati.
 *
 * Con Supabase configurato si usa il servizio; altrimenti l'app resta
 * completa in modalità locale. Il resto dell'applicazione non sa quale
 * delle due sta usando, e non deve saperlo.
 */

export interface Repositories {
  auth: AuthPort;
  catalog: CatalogPort;
  progress: ProgressPort;
  /** false = account e progressi vivono solo su questo dispositivo. */
  remote: boolean;
}

let cached: Repositories | null = null;

export function getRepositories(): Repositories {
  if (cached) return cached;

  const client = getSupabaseClient();
  cached =
    client && isSupabaseConfigured
      ? {
          auth: new SupabaseAuth(client),
          catalog: new SupabaseCatalog(client),
          progress: new SupabaseProgress(client),
          remote: true,
        }
      : {
          auth: new LocalAuth(asyncStorageStore),
          catalog: new LocalCatalog(),
          progress: new LocalProgress(asyncStorageStore),
          remote: false,
        };

  return cached;
}

/**
 * Catalogo locale come rete di sicurezza.
 *
 * Anche con Supabase configurato, se la rete manca l'utente deve poter
 * aprire l'app e suonare. Il catalogo dimostrativo è nel bundle: non
 * costa una richiesta e non fallisce mai.
 */
export const fallbackCatalog: CatalogPort = new LocalCatalog();
