const DATABASE_NAME = "pptx-font-updater"
const STORE_NAME = "font-files"
const DATABASE_VERSION = 1

type SavedFont = {
  key: string
  name: string
  type: string
  lastModified: number
  data: Blob
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is unavailable."))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open browser storage."))
  })
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Browser storage failed."))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Browser storage was interrupted."))
  })
}

export async function loadSavedFonts(): Promise<File[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const done = finished(transaction)
    const request = transaction.objectStore(STORE_NAME).getAll()
    let records: SavedFont[] = []
    request.onsuccess = () => {
      records = request.result as SavedFont[]
    }
    await done
    return records.map(
      (record) =>
        new File([record.data], record.name, {
          type: record.type,
          lastModified: record.lastModified,
        })
    )
  } finally {
    database.close()
  }
}

export async function saveFontFiles(files: File[]): Promise<void> {
  if (!files.length) return
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    for (const file of files) {
      store.put({
        key: `${file.name}\0${file.size}\0${file.lastModified}`,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        data: file,
      } satisfies SavedFont)
    }
    await finished(transaction)
  } finally {
    database.close()
  }
}

export async function clearSavedFonts(): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).clear()
    await finished(transaction)
  } finally {
    database.close()
  }
}
