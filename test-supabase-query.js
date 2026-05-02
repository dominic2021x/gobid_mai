// Test script pentru a verifica Supabase
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  // Test 1: Verifică dacă există produse
  const { data: allProducts, error: allError } = await supabase
    .from('produse')
    .select('id, titlu')
    .limit(5);
  
  console.log('Total products:', allProducts?.length || 0);
  if (allProducts && allProducts.length > 0) {
    console.log('Sample titles:', allProducts.map(p => p.titlu).slice(0, 3));
  }
  
  // Test 2: Caută "apartament"
  const { data: searchResults, error: searchError } = await supabase
    .from('produse')
    .select('id, titlu, descriere')
    .or('titlu.ilike.%apartament%,descriere.ilike.%apartament%')
    .limit(5);
  
  console.log('Search results for "apartament":', searchResults?.length || 0);
  if (searchError) {
    console.error('Search error:', searchError);
  }
}

test().catch(console.error);
