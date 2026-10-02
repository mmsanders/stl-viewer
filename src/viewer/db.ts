import type { UpAxis } from "@/viewer/types";

export type StoredModel = {
  id: string;
  name: string;
  visible: boolean;
  colorIndex: number;
  upAxis: UpAxis;
  createdAt: number;
  byteLength: number;
  data: ArrayBuffer;
};

export type Library = {
  persistent: boolean;
  list(): Promise<StoredModel[]>;
  get(id: string): Promise<StoredModel | null>;
  put(record: StoredModel): Promise<void>;
  delete(id: string): Promise<void>;
};

const DB_NAME = "plinth";
const STORE = "models";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Storage request failed."));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage."));
  });
}

function memoryLibrary(): Library {
  const rows = new Map<string, StoredModel>();
  return {
    persistent: false,
    async list() {
      return [...rows.values()].map(cloneRecord);
    },
    async get(id) {
      const row = rows.get(id);
      return row ? cloneRecord(row) : null;
    },
    async put(record) {
      rows.set(record.id, cloneRecord(record));
    },
    async delete(id) {
      rows.delete(id);
    },
  };
}

function cloneRecord(record: StoredModel): StoredModel {
  return { ...record, data: record.data.slice(0) };
}

export async function openLibrary(): Promise<Library> {
  if (typeof indexedDB === "undefined") return memoryLibrary();
  try {
    const db = await openDb();
    return {
      persistent: true,
      async list() {
        const tx = db.transaction(STORE, "readonly");
        const rows = await requestToPromise(tx.objectStore(STORE).getAll());
        return rows as StoredModel[];
      },
      async get(id) {
        const tx = db.transaction(STORE, "readonly");
        const row = await requestToPromise(tx.objectStore(STORE).get(id));
        return (row as StoredModel | undefined) ?? null;
      },
      async put(record) {
        const tx = db.transaction(STORE, "readwrite");
        await requestToPromise(tx.objectStore(STORE).put(record));
      },
      async delete(id) {
        const tx = db.transaction(STORE, "readwrite");
        await requestToPromise(tx.objectStore(STORE).delete(id));
      },
    };
  } catch {
    return memoryLibrary();
  }
}
