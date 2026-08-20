// IndexedDB storage helper for client-side audio chunk persistence (SACK Architecture)
const DB_NAME = "VoclaraAudioDB";
const DB_VERSION = 1;
const STORE_NAME = "audio_chunks";

let dbInstance = null;

export function initAudioDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error("IndexedDB open error:", e.target.error);
      reject(e.target.error);
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ["callId", "seq"] });
        store.createIndex("callId", "callId", { unique: false });
        store.createIndex("acked", "acked", { unique: false });
      }
    };
  });
}

// Save chunk to IndexedDB
export async function saveAudioChunk(callId, seq, data) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Convert ArrayBuffer or TypedArray to raw ArrayBuffer for clean DB storage
      let rawBuf = data;
      if (data && data.buffer) {
        rawBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }

      const item = {
        callId,
        seq,
        data: rawBuf,
        createdAt: Date.now(),
        acked: false,
      };

      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn("Failed to save audio chunk to IndexedDB:", err);
  }
}

// Mark chunk as acknowledged by server
export async function markChunkAcked(callId, seq) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get([callId, seq]);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          item.acked = true;
          store.put(item);
        }
        resolve(true);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn("Failed to mark chunk acked in IndexedDB:", err);
  }
}

// Get missing chunks for specific ranges [{ start: 1001, end: 1010 }]
export async function getMissingAudioChunks(callId, ranges) {
  try {
    const db = await initAudioDb();
    const missingChunks = [];

    for (const range of ranges) {
      const { start, end } = range;
      for (let s = start; s <= end; s++) {
        const chunk = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get([callId, s]);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });

        if (chunk && chunk.data) {
          missingChunks.push({ seq: s, data: chunk.data });
        }
      }
    }

    return missingChunks;
  } catch (err) {
    console.error("Error fetching missing chunks from IndexedDB:", err);
    return [];
  }
}

// Get all unacknowledged chunks for a call
export async function getUnackedChunks(callId) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("callId");
      const req = index.getAll(callId);

      req.onsuccess = () => {
        const items = req.result || [];
        const unacked = items.filter((item) => !item.acked);
        resolve(unacked);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Error fetching unacked chunks:", err);
    return [];
  }
}

// Purge IndexedDB records for a completed call
export async function clearCallAudioChunks(callId) {
  try {
    const db = await initAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("callId");
      const req = index.openKeyCursor(IDBKeyRange.only(callId));

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn("Failed to clear call chunks from IndexedDB:", err);
  }
}
