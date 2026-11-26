const DB_NAME = 'cf_mai_clinic_db';
const DB_VERSION = 2;
const STORE_NAME = 'datasets';
const DELTA_STORE_NAME = 'dataset_deltas';
const LOCAL_STORAGE_PREFIX = 'cf_mai_';

export const LARGE_DATASET_KEYS = [
  'patients',
  'appointments',
  'invoices',
  'payments',
  'operations'
] as const;

export type LargeDatasetKey = (typeof LARGE_DATASET_KEYS)[number];

export interface StoredDeltaEntry<T = unknown> {
  id: string;
  isDeleted: boolean;
  record?: T;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(DELTA_STORE_NAME)) {
          db.createObjectStore(DELTA_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: LargeDatasetKey): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: LargeDatasetKey, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB save warning:', e);
  }
}

export async function idbDelete(key: LargeDatasetKey): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}

export async function idbGetDelta<T>(key: LargeDatasetKey): Promise<StoredDeltaEntry<T>[] | null> {
  try {
    const db = await openDatabase();
    return await new Promise<StoredDeltaEntry<T>[] | null>((resolve, reject) => {
      const tx = db.transaction(DELTA_STORE_NAME, 'readonly');
      const store = tx.objectStore(DELTA_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as StoredDeltaEntry<T>[]) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbSetDelta<T>(key: LargeDatasetKey, entries: StoredDeltaEntry<T>[]): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DELTA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DELTA_STORE_NAME);
      const req = store.put(entries, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB delta save warning:', e);
  }
}

export async function idbDeleteDelta(key: LargeDatasetKey): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DELTA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DELTA_STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}

export async function clearAllLargeDatasets(): Promise<void> {
  for (const key of LARGE_DATASET_KEYS) {
    try {
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + key);
    } catch {
      // ignore
    }
    await idbDelete(key);
    await idbDeleteDelta(key);
  }
}

/**
 * Safely clears bloated legacy large keys from localStorage to prevent QuotaExceededError,
 * migrating any existing modified data to IndexedDB first.
 */
export async function migrateLegacyLocalStorage(): Promise<void> {
  for (const key of LARGE_DATASET_KEYS) {
    const lsKey = LOCAL_STORAGE_PREFIX + key;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const existing = await idbGet(key);
          const existingDelta = await idbGetDelta(key);
          if (!existing && !existingDelta && Array.isArray(parsed) && parsed.length > 0) {
            await idbSet(key, parsed);
          }
        } catch {
          // ignore invalid JSON
        }
        localStorage.removeItem(lsKey);
      }
    } catch {
      // ignore
    }
  }
}
