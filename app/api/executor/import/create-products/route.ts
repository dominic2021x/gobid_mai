/**
 * API Route - Creare Produse din Import pentru Executori
 * POST /api/executor/import/create-products
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { slugify, generateUniqueSlug } from '@/lib/slugify';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute

// Create Supabase admin client with service role key to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

let supabaseAdmin: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn('Supabase admin client not available - missing service role key');
}

// Create regular client for auth
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

interface ProductData {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  startingPrice: number;
  currency: 'RON' | 'EUR';
  auctionDate?: string;
  location?: string;
  county?: string;
  city?: string;
  address?: string;
  images?: string[];
  documents?: string[];
  [key: string]: any;
}

/**
 * Generează automat o imagine bazată pe categoria, subcategoria și localitatea produsului
 */
function generateImageUrl(
  category: string,
  subcategory?: string,
  location?: string,
  city?: string,
  county?: string
): string {
  // Mapări specifice pentru categorii și subcategorii
  const categoryImageMap: Record<string, Record<string, string>> = {
    'Imobiliare': {
      'Apartamente': 'apartment building residential',
      'Case': 'house residential building',
      'Terenuri': 'land property plot',
      'Spații comerciale': 'commercial building office',
      'Spații industriale': 'industrial building warehouse',
      'default': 'real estate property building',
    },
    'Autovehicule': {
      'Autoturisme': 'car vehicle automobile',
      'Motociclete': 'motorcycle bike',
      'Camioane': 'truck vehicle',
      'Tractoare': 'tractor vehicle',
      'default': 'car vehicle automobile',
    },
    'Mobilier': {
      'Mobilier de birou': 'office furniture desk',
      'Mobilier de living': 'living room furniture sofa',
      'Mobilier de bucătărie': 'kitchen furniture',
      'default': 'furniture home',
    },
    'Echipamente': {
      'Echipamente industriale': 'industrial equipment machinery',
      'Echipamente medicale': 'medical equipment hospital',
      'Echipamente IT': 'computer technology equipment',
      'default': 'equipment machinery',
    },
    'Electronice': {
      'Telefoane': 'smartphone mobile phone',
      'Laptopuri': 'laptop computer',
      'Televizoare': 'tv television screen',
      'default': 'electronics devices',
    },
  };

  // Construiește query-ul pentru căutare de imagini
  const searchTerms: string[] = [];
  
  // Verifică dacă există mapare specifică pentru categorie și subcategorie
  if (category && categoryImageMap[category]) {
    const subcategoryMap = categoryImageMap[category];
    const subcategoryKey = subcategory?.trim() || 'default';
    
    // Caută subcategoria exactă sau folosește default
    if (subcategoryMap[subcategoryKey]) {
      searchTerms.push(subcategoryMap[subcategoryKey]);
    } else {
      // Caută subcategorii similare
      const subcategoryLower = subcategoryKey.toLowerCase();
      const foundSubcategory = Object.keys(subcategoryMap).find(key => 
        key !== 'default' && subcategoryLower.includes(key.toLowerCase())
      );
      
      if (foundSubcategory) {
        searchTerms.push(subcategoryMap[foundSubcategory]);
      } else {
        searchTerms.push(subcategoryMap['default'] || 'product item');
      }
    }
  } else {
    // Fallback la maparea veche pentru categorii
    const categoryMap: Record<string, string> = {
      'Autovehicule': 'car vehicle automobile',
      'Imobiliare': 'real estate property building',
      'Mobilier': 'furniture',
      'Echipamente': 'equipment machinery',
      'Electronice': 'electronics devices',
      'Alte bunuri': 'items goods',
    };
    searchTerms.push(categoryMap[category] || category.toLowerCase());
  }
  
  // Construiește query-ul final
  const query = searchTerms.join(' ').trim() || 'product item';
  
  // Folosește Unsplash Source API (gratuit, fără autentificare)
  // Format: https://source.unsplash.com/800x600/?{query}
  const encodedQuery = encodeURIComponent(query);
  return `https://source.unsplash.com/800x600/?${encodedQuery}`;
}

/**
 * Obține datele executorului pentru custom_fields
 */
async function getExecutorDataForCustomFields(userId: string): Promise<Record<string, any>> {
  if (!supabaseAdmin) {
    return {};
  }

  try {
    const { data: executorProfile, error: executorError } = await supabaseAdmin
      .from('user_profiles')
      .select('licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (executorError || !executorProfile) {
      console.warn(`⚠️ [CreateProduct] Could not fetch executor profile for userId ${userId}:`, executorError);
      return {};
    }

    // Returnează datele executorului în format pentru custom_fields
    const profile = executorProfile as any;
    return {
      licitator_name: profile.licitator_name || undefined,
      licitator_address: profile.licitator_address || undefined,
      licitator_fiscal_code: profile.licitator_fiscal_code || undefined,
      licitator_consignment_account: profile.licitator_consignment_account || undefined,
      licitator_email: profile.licitator_email || undefined,
      licitator_phone: profile.licitator_phone || undefined,
      licitator_fax: profile.licitator_fax || undefined,
      licitator_competence: profile.licitator_competence || undefined,
      avatar_url: profile.avatar_url || undefined,
    };
  } catch (error) {
    console.error(`❌ [CreateProduct] Error fetching executor data for userId ${userId}:`, error);
    return {};
  }
}

/**
 * Creează un produs în baza de date
 */
async function createProduct(
  productData: ProductData,
  userId: string
): Promise<string | null> {
  try {
    // Validare câmpuri obligatorii
    if (!productData.title || !productData.title.trim()) {
      throw new Error('Title is required');
    }
    if (!productData.category || !productData.category.trim()) {
      throw new Error('Category is required');
    }
    if (!productData.startingPrice || typeof productData.startingPrice !== 'number' || productData.startingPrice <= 0) {
      throw new Error('Starting price must be a positive number');
    }
    if (!productData.currency || (productData.currency !== 'RON' && productData.currency !== 'EUR')) {
      // Default la Lei dacă nu este specificat
      productData.currency = 'RON';
    }

    console.log(`🔵 [CreateProduct] Validated product data:`, {
      title: productData.title,
      category: productData.category,
      startingPrice: productData.startingPrice,
      currency: productData.currency,
      hasDescription: !!productData.description,
      hasImages: Array.isArray(productData.images),
      hasDocuments: Array.isArray(productData.documents),
    });

    // Generează slug unic
    const baseSlug = slugify(productData.title);
    
    // Obține slug-urile existente din baza de date pentru a verifica unicitatea
    let existingSlugs: string[] = [];
    if (supabaseAdmin) {
      try {
        const { data: existingProducts } = await supabaseAdmin
          .from('products')
          .select('slug')
          .not('slug', 'is', null);
        
        if (existingProducts) {
          existingSlugs = existingProducts.map((p: any) => p.slug).filter(Boolean);
        }
      } catch (error) {
        console.warn('⚠️ [CreateProduct] Could not fetch existing slugs, using empty array:', error);
        existingSlugs = [];
      }
    }
    
    const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

    // Generează SKU unic
    const SKU_TOTAL_LENGTH = 10;
    const SKU_PREFIX_LENGTH = 4;
    const SKU_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    const normalizeSubcategoryName = (value: string): string => {
      if (!value) return '';
      return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase();
    };
    
    const generateRandomSuffix = (length: number): string => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += SKU_CHARSET.charAt(Math.floor(Math.random() * SKU_CHARSET.length));
      }
      return result;
    };
    
    let sku = '';
    const subcategoryNormalized = normalizeSubcategoryName(productData.subcategory || productData.category || '');
    
    if (subcategoryNormalized) {
      const prefix = (subcategoryNormalized + 'XXXX').slice(0, SKU_PREFIX_LENGTH);
      const suffix = generateRandomSuffix(SKU_TOTAL_LENGTH - SKU_PREFIX_LENGTH);
      sku = (prefix + suffix).slice(0, SKU_TOTAL_LENGTH);
    } else {
      // Dacă nu avem subcategorie, generează un SKU complet aleator
      sku = generateRandomSuffix(SKU_TOTAL_LENGTH);
    }
    
    // Verifică dacă SKU-ul există deja și generează unul nou dacă este necesar
    let existingSkus: string[] = [];
    if (supabaseAdmin) {
      try {
        const { data: existingProducts } = await supabaseAdmin
          .from('products')
          .select('sku')
          .not('sku', 'is', null);
        
        if (existingProducts) {
          existingSkus = existingProducts.map((p: any) => p.sku).filter(Boolean);
        }
      } catch (error) {
        console.warn('⚠️ [CreateProduct] Could not fetch existing SKUs, using generated SKU:', error);
      }
    }
    
    // Dacă SKU-ul există deja, generează unul nou
    let attempts = 0;
    while (existingSkus.includes(sku) && attempts < 10) {
      if (subcategoryNormalized) {
        const prefix = (subcategoryNormalized + 'XXXX').slice(0, SKU_PREFIX_LENGTH);
        const suffix = generateRandomSuffix(SKU_TOTAL_LENGTH - SKU_PREFIX_LENGTH);
        sku = (prefix + suffix).slice(0, SKU_TOTAL_LENGTH);
      } else {
        sku = generateRandomSuffix(SKU_TOTAL_LENGTH);
      }
      attempts++;
    }

    // Calculează prețurile în ambele monede
    const exchangeRate = productData.currency === 'EUR' ? 5.0 : 1.0; // Rata de schimb aproximativă
    const startingPriceRON = productData.currency === 'RON' 
      ? productData.startingPrice 
      : productData.startingPrice * exchangeRate;
    const startingPriceEUR = productData.currency === 'EUR'
      ? productData.startingPrice
      : productData.startingPrice / exchangeRate;

    // Creează produsul folosind admin client pentru a bypass RLS
    // IMPORTANT: Produsele sunt salvate PERMANENT în baza de date cu user_id (executor_id)
    // și vor apărea la TOATE anunțurile executorului respectiv
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not available');
    }

    console.log(`🔵 [CreateProduct] Creating product for userId: ${userId}`);
    console.log(`🔵 [CreateProduct] Product data:`, {
      title: productData.title,
      category: productData.category,
      startingPrice: productData.startingPrice,
    });

    const rawImages: string[] = (() => {
      if (Array.isArray(productData.images) && productData.images.length > 0) {
        return productData.images;
      }
      const generatedImage = generateImageUrl(
        productData.category,
        productData.subcategory,
        productData.location,
        productData.city,
        productData.county
      );
      return [generatedImage];
    })();
    const insertData = {
      title: productData.title,
      description: productData.description,
      category: productData.category,
      subcategory: productData.subcategory || '',
      sku: sku,
      starting_price: productData.startingPrice,
      starting_price_ron: startingPriceRON,
      starting_price_eur: startingPriceEUR,
      currency: productData.currency,
      product_type: 'licitatii-publice',
      sale_type: 'licitatii-executori',
      status: 'active' as const, // Produsele sunt salvate PERMANENT în baza de date și active imediat
      // pentru a apărea la TOATE anunțurile executorului (user_id)
      county: productData.county || null,
      city: productData.city || null,
      address: productData.address || null,
      auction_date: productData.auctionDate || null,
      images: rawImages,
      documents: Array.isArray(productData.documents) ? productData.documents : [],
      slug: uniqueSlug,
      url: `/licitatii-publice/${uniqueSlug}`,
      custom_fields: {
        ...productData,
        ...(await getExecutorDataForCustomFields(userId)), // Adaugă datele executorului în custom_fields (publice)
        imported_from: 'executor_import',
        imported_at: new Date().toISOString(),
      },
      user_id: userId, // Asociază produsul permanent cu executorul (executor_id)
    };

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert(insertData as any)
      .select('id, user_id, status, title')
      .single();

    if (error) {
      console.error('❌ [CreateProduct] Error creating product:', error);
      console.error('❌ [CreateProduct] Error details:', JSON.stringify(error, null, 2));
      console.error('❌ [CreateProduct] Error code:', error.code);
      console.error('❌ [CreateProduct] Error message:', error.message);
      console.error('❌ [CreateProduct] Error hint:', error.hint);
      throw new Error(`Failed to create product: ${error.message} (code: ${error.code})`);
    }

    if (!data) {
      throw new Error('Product was not created - no data returned from insert');
    }

    const createdProduct = data as any;
    console.log(`✅ [CreateProduct] Product created successfully:`, {
      id: createdProduct.id,
      user_id: createdProduct.user_id,
      status: createdProduct.status,
      title: createdProduct.title,
    });

    if (supabaseAdmin && rawImages.length > 0) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: createdProduct.id,
        userId,
        imageUrls: rawImages,
      });
    }

    return createdProduct.id;
  } catch (error: any) {
    console.error('❌ [CreateProduct] Error in createProduct:', error);
    console.error('❌ [CreateProduct] Error stack:', error?.stack);
    // Aruncă eroarea mai departe în loc să returneze null
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products, userId: bodyUserId } = body;

    console.log('🔵 [CreateProducts] Request received:', {
      hasProducts: !!products,
      productsCount: products?.length || 0,
      bodyUserId: bodyUserId,
      bodyKeys: Object.keys(body),
    });

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Lista de produse este obligatorie' },
        { status: 400 }
      );
    }

    // Obține utilizatorul curent din header-ul Authorization sau din body
    let userId: string | null = null;

    // PRIORITATE 1: userId din body (cel mai sigur pentru auto-create)
    if (bodyUserId) {
      userId = bodyUserId;
      console.log('✅ [CreateProducts] Using userId from body:', userId);
    } else {
      console.warn('⚠️ [CreateProducts] No userId in body, trying other methods...');
    }

    // PRIORITATE 2: Încearcă să obțină userId din Authorization header
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      console.log('🔵 [CreateProducts] Checking authorization header:', {
        hasHeader: !!authHeader,
        headerLength: authHeader?.length || 0,
      });
      
      if (authHeader && supabase) {
        try {
          const token = authHeader.replace('Bearer ', '');
          console.log('🔵 [CreateProducts] Extracting user from token...');
          const { data: { user }, error: userError } = await supabase.auth.getUser(token);
          if (!userError && user) {
            userId = user.id;
            console.log('✅ [CreateProducts] Using userId from token:', userId);
          } else {
            console.error('❌ [CreateProducts] Error getting user from token:', userError);
          }
        } catch (error: any) {
          console.error('❌ [CreateProducts] Error parsing token:', error);
          console.error('❌ [CreateProducts] Error details:', error?.message);
        }
      } else if (!authHeader) {
        console.warn('⚠️ [CreateProducts] No authorization header found');
      } else if (!supabase) {
        console.warn('⚠️ [CreateProducts] Supabase client not available');
      }
    }

    // PRIORITATE 3: Încearcă cu supabase client normal (nu va funcționa în API route, dar încercăm)
    if (!userId && supabase) {
      try {
        console.log('🔵 [CreateProducts] Trying to get user from supabase client...');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!userError && userData?.user) {
          userId = userData.user.id;
          console.log('✅ [CreateProducts] Using userId from supabase client:', userId);
        } else {
          console.error('❌ [CreateProducts] Error getting user from supabase client:', userError);
        }
      } catch (error: any) {
        console.error('❌ [CreateProducts] Error getting user from supabase client:', error);
        console.error('❌ [CreateProducts] Error details:', error?.message);
      }
    }

    if (!userId) {
      console.error('❌ [CreateProducts] No userId found after all attempts');
      console.error('❌ [CreateProducts] Request body keys:', Object.keys(body));
      console.error('❌ [CreateProducts] Request headers:', {
        authorization: request.headers.get('authorization') ? 'present' : 'missing',
        contentType: request.headers.get('content-type'),
        allHeaders: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'Utilizator neautentificat. Te rog reconectează-te.',
          debug: {
            hasBodyUserId: !!bodyUserId,
            bodyUserId: bodyUserId,
            hasAuthHeader: !!request.headers.get('authorization'),
          }
        },
        { status: 401 }
      );
    }

    console.log('✅ [CreateProducts] Final userId:', userId);

    console.log(`🔵 [CreateProducts] Starting creation for userId: ${userId}, products count: ${products.length}`);

    // Creează produsele
    const createdProducts: string[] = [];
    const failedProducts: Array<{ title: string; error: string }> = [];

    for (const productData of products) {
      try {
        console.log(`🔵 [CreateProducts] Attempting to create product:`, {
          title: productData.title,
          category: productData.category,
          userId: userId,
          hasDescription: !!productData.description,
          hasCategory: !!productData.category,
          hasStartingPrice: !!productData.startingPrice,
          currency: productData.currency,
        });
        
        const productId = await createProduct(productData, userId);
        
        if (productId) {
          createdProducts.push(productId);
          console.log(`✅ [CreateProducts] Product created successfully: ${productId}`);
        } else {
          // Acest caz nu ar trebui să se întâmple niciodată, dar dacă se întâmplă, logăm
          const errorMsg = 'createProduct returned null - unexpected error';
          console.error(`❌ [CreateProducts] Failed to create product: ${productData.title} - ${errorMsg}`);
          failedProducts.push({
            title: productData.title || 'Produs fără titlu',
            error: errorMsg,
          });
        }
      } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        console.error('❌ [CreateProducts] Error creating product:', error);
        console.error('❌ [CreateProducts] Error stack:', error?.stack);
        console.error('❌ [CreateProducts] Error details:', JSON.stringify(error, null, 2));
        failedProducts.push({
          title: productData.title || 'Produs fără titlu',
          error: errorMsg,
        });
      }
    }

    console.log(`🔵 [CreateProducts] Creation complete. Created: ${createdProducts.length}, Failed: ${failedProducts.length}`);

    const response = {
      success: true,
      createdCount: createdProducts.length,
      failedCount: failedProducts.length,
      createdProductIds: createdProducts,
      failedProducts,
      userId: userId, // Return userId for debugging
      message: `Creat cu succes ${createdProducts.length} din ${products.length} produse.`,
    };

    if (failedProducts.length > 0) {
      console.error('❌ [CreateProducts] Failed products details:', failedProducts);
      response.message += ` Erori: ${failedProducts.map(f => `${f.title} (${f.error})`).join(', ')}`;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error in create-products:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Eroare la crearea produselor',
      },
      { status: 500 }
    );
  }
}
