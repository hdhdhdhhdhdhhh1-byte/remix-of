import { openDB, IDBPDatabase } from 'idb'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB('battery-offline-v1', 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('persons')) db.createObjectStore('persons', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('reports')) {
          const store = db.createObjectStore('reports', { keyPath: 'id' })
          store.createIndex('by_date', 'report_date', { unique: true })
        }
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' })
          store.createIndex('by_report', 'report_id', { unique: false })
        }
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'local_id', autoIncrement: true })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
      }
    })
  }
  return dbPromise
}
