/**
 * Archivio chiave-valore.
 *
 * Isolato dietro un'interfaccia per due motivi concreti: i test girano
 * su un'implementazione in memoria (niente mock di moduli nativi) e
 * passare un domani a SQLite o MMKV non tocca il resto dell'app.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Implementazione in memoria: usata dai test e come ripiego se il disco fallisce. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async set(key: string, value: string) { this.data.set(key, value); }
  async remove(key: string) { this.data.delete(key); }
  async keys() { return [...this.data.keys()]; }
}

/**
 * Legge un JSON tollerando i dati corrotti.
 *
 * Un archivio locale puo' contenere un valore scritto da una versione
 * precedente dell'app, o troncato da uno spegnimento improvviso. Meglio
 * ripartire dal valore predefinito che mostrare una schermata bianca.
 */
export async function readJson<T>(store: KeyValueStore, key: string, fallback: T): Promise<T> {
  try {
    const raw = await store.get(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(store: KeyValueStore, key: string, value: unknown): Promise<void> {
  await store.set(key, JSON.stringify(value));
}
