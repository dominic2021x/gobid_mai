// Persistent product storage using IndexedDB
// IndexedDB survives browser cache/history clearing (unless user explicitly clears all site data)

const DB_NAME = 'gobid_products_db';
const DB_VERSION = 1;
const STORE_NAME = 'products';

interface Product {
  id: string;
  [key: string]: any;
}

// Initialize IndexedDB
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
        objectStore.createIndex('category', 'category', { unique: false });
        objectStore.createIndex('status', 'status', { unique: false });
      }
    };
  });
};

// Save products to IndexedDB
export const saveProductsToIndexedDB = async (products: Product[]): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing products
    await store.clear();

    // Add all products
    for (const product of products) {
      await store.put(product);
    }

    // Wait for transaction to complete
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    
    // Also sync to localStorage for immediate access (backup)
    if (typeof window !== 'undefined') {
      localStorage.setItem('products', JSON.stringify(products));
      localStorage.setItem('products_last_sync', new Date().toISOString());
    }
  } catch (error) {
    console.error('Error saving products to IndexedDB:', error);
    throw error;
  }
};

// Load products from IndexedDB
export const loadProductsFromIndexedDB = async (): Promise<Product[]> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const products = request.result || [];
        resolve(products);
        
        // Sync to localStorage for immediate access
        if (typeof window !== 'undefined') {
          localStorage.setItem('products', JSON.stringify(products));
          localStorage.setItem('products_last_sync', new Date().toISOString());
        }
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to load products: ${request.error}`));
      };
    });
  } catch (error) {
    console.error('Error loading products from IndexedDB:', error);
    
    // Fallback to localStorage if IndexedDB fails
    if (typeof window !== 'undefined') {
      const savedProducts = localStorage.getItem('products');
      if (savedProducts) {
        try {
          return JSON.parse(savedProducts);
        } catch (e) {
          console.error('Error parsing localStorage products:', e);
        }
      }
    }
    
    return [];
  }
};

// Sync localStorage products to IndexedDB (called on app load)
export const syncProductsToIndexedDB = async (): Promise<void> => {
  try {
    if (typeof window === 'undefined') return;
    
    // First, try to load from IndexedDB (most persistent)
    const indexedProducts = await loadProductsFromIndexedDB();
    
    // If IndexedDB has products, use those (they're the source of truth)
    if (indexedProducts && indexedProducts.length > 0) {
      localStorage.setItem('products', JSON.stringify(indexedProducts));
      localStorage.setItem('products_last_sync', new Date().toISOString());
      return;
    }
    
    // If IndexedDB is empty, check localStorage and sync to IndexedDB
    const savedProducts = localStorage.getItem('products');
    if (savedProducts) {
      try {
        const products = JSON.parse(savedProducts);
        if (products && products.length > 0) {
          await saveProductsToIndexedDB(products);
        }
      } catch (e) {
        console.error('Error syncing products from localStorage:', e);
      }
    }
  } catch (error) {
    console.error('Error syncing products to IndexedDB:', error);
  }
};

// Export products as JSON file
export const exportProducts = async (): Promise<Blob> => {
  const products = await loadProductsFromIndexedDB();
  const json = JSON.stringify(products, null, 2);
  return new Blob([json], { type: 'application/json' });
};

// Import products from JSON file
export const importProducts = async (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const products = JSON.parse(e.target?.result as string);
        if (!Array.isArray(products)) {
          reject(new Error('Invalid file format: expected array of products'));
          return;
        }
        
        await saveProductsToIndexedDB(products);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
};

// Check if IndexedDB is available
export const isIndexedDBAvailable = (): boolean => {
  return typeof window !== 'undefined' && 'indexedDB' in window;
};

