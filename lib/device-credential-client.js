// Stores this browser's server-issued device token(s) in IndexedDB, keyed by
// Staff ID. IndexedDB (not localStorage) so the credential survives app
// close/phone restart/reopen without relying on storage that browsers are
// more willing to evict under pressure.
const DB_NAME = "qr-attendance-device";
const DB_VERSION = 1;
const STORE_NAME = "device-tokens";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredDeviceToken(teacherId) {
  const key = String(teacherId || "").trim().toUpperCase();

  if (!key) {
    return null;
  }

  try {
    const db = await openDb();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function storeDeviceToken(teacherId, token) {
  const key = String(teacherId || "").trim().toUpperCase();

  if (!key || !token) {
    return;
  }

  try {
    const db = await openDb();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(token, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Best-effort: if IndexedDB is unavailable, device registration will
    // simply be re-prompted next time, which is a safe fallback.
  }
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Best-effort only; unsupported browsers just keep default storage.
  }
}
