/**
 * Database Products - CRUD Operations pentru Produse
 * Funcții helper pentru gestionarea produselor în Supabase
 */

import { supabase } from '@/lib/supabase';

export interface Product {
  id?: string;
  titlu: string;
  descriere?: string;
  pret?: number;
  imagini?: string[] | any;
  created_at?: string;
  updated_at?: string;
}

/**
 * Adaugă un produs nou în baza de date
 */
export async function addProduct(product: Product) {
  const { data, error } = await supabase
    .from('produse')
    .insert([product])
    .select()
    .single();

  if (error) {
    console.error('Error adding product:', error);
    throw new Error(`Failed to add product: ${error.message}`);
  }

  return data;
}

/**
 * Listă toate produsele
 */
export async function listProducts() {
  const { data, error } = await supabase
    .from('produse')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing products:', error);
    throw new Error(`Failed to list products: ${error.message}`);
  }

  return data || [];
}

/**
 * Obține un produs după ID
 */
export async function getProductById(id: string) {
  const { data, error } = await supabase
    .from('produse')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting product:', error);
    throw new Error(`Failed to get product: ${error.message}`);
  }

  return data;
}

/**
 * Actualizează un produs existent
 */
export async function updateProduct(id: string, updates: Partial<Product>) {
  const { data, error } = await supabase
    .from('produse')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating product:', error);
    throw new Error(`Failed to update product: ${error.message}`);
  }

  return data;
}

/**
 * Șterge un produs
 */
export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from('produse')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product:', error);
    throw new Error(`Failed to delete product: ${error.message}`);
  }

  return { success: true };
}


