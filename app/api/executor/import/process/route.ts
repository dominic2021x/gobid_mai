import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route - Procesare Import GoBid AI pentru Executori
 * POST /api/executor/import/process
 *
 * Procesează PDF-uri, CSV-uri și alte surse cu AI pentru extragere automată de produse
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { extractTextFromPDFBuffer } from '@/lib/anaf/pdfExtractor';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

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

interface ExtractedProduct {
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
 * Extrage text din PDF folosind EXCLUSIV OCR (Vision)
 * IMPORTANT: Folosește același pipeline OCR ca pentru ANAF - OCR este obligatoriu pentru toate tipurile de PDF-uri
 */
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  try {
    // Verifică dacă buffer-ul este valid
    if (!buffer || buffer.length === 0) {
      throw new Error('Fișierul PDF este gol sau invalid');
    }

    // Verifică dacă este un PDF valid (începe cu %PDF)
    const pdfHeader = buffer.slice(0, 4).toString();
    if (!pdfHeader.startsWith('%PDF')) {
      throw new Error('Fișierul nu este un PDF valid. Te rog selectează un fișier PDF corect.');
    }

    // Folosește pipeline-ul OCR exclusiv (Poppler + OpenAI Vision)
    console.log('[Executor Import] Extracting text from PDF using OCR pipeline...');
    const extractionResult = await extractTextFromPDFBuffer(buffer);

    if (!extractionResult.text || extractionResult.text.trim().length === 0) {
      throw new Error(
        'Nu s-a putut extrage text din PDF folosind OCR. ' +
        'PDF-ul poate fi scanat și necesită Poppler pentru procesare. ' +
        'Asigură-te că Poppler este instalat: macOS: `brew install poppler`, Linux: `sudo apt-get install poppler-utils`.'
      );
    }

    return {
      text: extractionResult.text,
      numPages: extractionResult.numPages || 0,
    };
  } catch (error: any) {
    console.error('[Executor Import] Error extracting text from PDF:', error);
    
    // Mesaje de eroare mai clare pentru diferite tipuri de erori
    if (error.message.includes('Poppler') || error.message.includes('pdftoppm') || error.message.includes('nu este instalat')) {
      throw new Error(
        'PDF-ul necesită Poppler pentru extragere OCR. ' +
        'Poppler nu este instalat sau nu este disponibil. ' +
        '\n\nInstalează Poppler:\n' +
        '• macOS: `brew install poppler` (necesită Homebrew)\n' +
        '• Linux: `sudo apt-get install poppler-utils`\n' +
        '• Windows: Descarcă de la https://poppler.freedesktop.org/ și adaugă în PATH\n\n' +
        'După instalare, repornește serverul Next.js.'
      );
    } else if (error.message.includes('OCR failed') || error.message.includes('no usable text')) {
      throw new Error(
        'OCR nu a putut extrage text util din PDF. ' +
        'PDF-ul poate fi de calitate slabă, corupt sau protejat. ' +
        'Te rog verifică fișierul și încearcă din nou.'
      );
    } else if (error.message.includes('Invalid PDF')) {
      throw new Error('PDF-ul este invalid sau corupt. Te rog verifică fișierul și încearcă din nou.');
    } else if (error.message.includes('password') || error.message.includes('encrypted')) {
      throw new Error('PDF-ul este protejat cu parolă. Te rog elimină protecția și încearcă din nou.');
    } else if (error.message.includes('gol') || error.message.includes('empty')) {
      throw new Error('PDF-ul este gol sau nu conține text. Te rog verifică fișierul.');
    } else {
      throw new Error(`Nu am putut încărca documentele PDF: ${error.message || 'Eroare necunoscută'}`);
    }
  }
}

/**
 * Parsează CSV și returnează array de obiecte
 */
function parseCSV(csvText: string): any[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Detectează header-ul (prima linie)
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    if (Object.values(row).some(v => v)) {
      rows.push(row);
    }
  }

  return rows;
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
 * Procesează textul cu AI pentru a extrage produse
 */
async function extractProductsWithAI(
  text: string,
  sourceType: string
): Promise<ExtractedProduct[]> {
  const systemPrompt = `Ești un expert în procesarea documentelor de licitații publice pentru executori judecătorești.
Analizează textul furnizat și extrage toate produsele/loturile disponibile pentru licitație.

Pentru fiecare produs, extrage:
- Titlu (nume produs/lot)
- Descriere detaliată
- Categorie (Autovehicule, Imobiliare, Mobilier, Echipamente, Alte bunuri, etc.)
- Subcategorie (dacă este relevant)
- Preț de pornire (preț minim de licitație)
- Monedă (Lei sau EUR)
- Data licitației (format ISO: YYYY-MM-DDTHH:MM)
- Locație (județ, oraș, adresă)
- Alte informații relevante

Returnează un JSON array cu toate produsele găsite. Fiecare produs trebuie să aibă:
{
  "title": "string",
  "description": "string",
  "category": "string",
  "subcategory": "string (opțional)",
  "startingPrice": number,
  "currency": "RON" | "EUR",
  "auctionDate": "string (ISO format, opțional)",
  "location": "string (opțional)",
  "county": "string (opțional)",
  "city": "string (opțional)",
  "address": "string (opțional)"
}

Important: Returnează DOAR JSON array-ul, fără text suplimentar înainte sau după.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Analizează următorul text dintr-un document de tip ${sourceType} și extrage toate produsele disponibile pentru licitație:\n\n${text.substring(0, 15000)}`, // Limitează la 15000 caractere
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);

    // Dacă AI-ul returnează un obiect cu cheia "products", folosește-o
    const products = parsed.products || (Array.isArray(parsed) ? parsed : [parsed]);

    return products.map((p: any) => ({
      title: p.title || 'Produs fără titlu',
      description: p.description || '',
      category: p.category || 'Alte bunuri',
      subcategory: p.subcategory || '',
      startingPrice: parseFloat(p.startingPrice) || 0,
      currency: (p.currency === 'EUR' ? 'EUR' : 'RON') as 'RON' | 'EUR',
      auctionDate: p.auctionDate || undefined,
      location: p.location || undefined,
      county: p.county || undefined,
      city: p.city || undefined,
      address: p.address || undefined,
      ...p,
    }));
  } catch (error: any) {
    console.error('Error extracting products with AI:', error);
    throw new Error(`Eroare la procesarea cu AI: ${error.message}`);
  }
}

/**
 * Salvează importul în baza de date
 */
async function saveImport(
  sourceType: string,
  sourceUrl: string | null,
  fileName: string | null,
  status: string,
  products: ExtractedProduct[] | null = null,
  errorMessage: string | null = null
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not available');
  }

  const insertData = {
    source_type: sourceType,
    source_url: sourceUrl,
    file_name: fileName,
    status,
    products_data: products,
    error_message: errorMessage,
    products_created: products?.length || 0,
  };

  const { data, error } = await supabaseAdmin
    .from('executor_imports')
    .insert(insertData as any)
    .select('id')
    .single();

  if (error) {
    console.error('Error saving import:', error);
    throw new Error(`Eroare la salvarea importului: ${error.message}`);
  }

  if (!data) {
    throw new Error('Import was not saved - no data returned');
  }

  const importData = data as any;
  return importData.id;
}

export async function POST(request: NextRequest) {
  try {
    let file: File | null = null;
    let sourceType = 'pdf';
    let autoCreate = false;
    let userId: string | null = null;
    let url: string | null = null;

    // Verifică tipul de conținut
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Este FormData (file upload)
      const formData = await request.formData();
      file = formData.get('file') as File | null;
      sourceType = (formData.get('sourceType') as string) || 'pdf';
      autoCreate = formData.get('autoCreate') === 'true';
      userId = formData.get('userId') as string | null;
    } else {
      // Este JSON
      try {
        const body = await request.json();
        url = body.url || null;
        sourceType = body.sourceType || 'url';
        autoCreate = body.autoCreate || false;
        userId = body.userId || null;
        
        if (!url) {
          return NextResponse.json(
            { success: false, error: 'URL sau fișier este obligatoriu' },
            { status: 400 }
          );
        }
      } catch (error) {
        console.error('Error parsing JSON body:', error);
        return NextResponse.json(
          { success: false, error: 'Format invalid pentru request' },
          { status: 400 }
        );
      }
    }

    // Obține userId din Authorization header dacă nu este în body/formData
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          if (supabaseUrl && supabaseAnonKey) {
            const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
            const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
            if (!userError && user) {
              userId = user.id;
            }
          }
        } catch (error) {
          console.error('Error getting user from token:', error);
        }
      }
    }

    if (!file && !url) {
      return NextResponse.json(
        { success: false, error: 'Fișier sau URL este obligatoriu' },
        { status: 400 }
      );
    }

    let text = '';
    let extractedProducts: ExtractedProduct[] = [];

    try {
      if (file) {
        // Validare dimensiune fișier (max 50MB pentru PDF, 10MB pentru CSV)
        const maxSize = sourceType === 'pdf' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Fișierul este prea mare. Dimensiunea maximă pentru ${sourceType.toUpperCase()} este ${maxSize / 1024 / 1024}MB.` 
            },
            { status: 400 }
          );
        }

        // Validare tip fișier
        if (sourceType === 'pdf' && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Fișierul selectat nu este un PDF valid. Te rog selectează un fișier PDF.' 
            },
            { status: 400 }
          );
        }

        if (sourceType === 'csv' && !file.type.includes('csv') && !file.type.includes('text') && !file.name.toLowerCase().endsWith('.csv')) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Fișierul selectat nu este un CSV valid. Te rog selectează un fișier CSV.' 
            },
            { status: 400 }
          );
        }

        // Procesează fișier
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (sourceType === 'pdf') {
          try {
            const extraction = await extractTextFromPDF(buffer);
            text = extraction.text;
            
            if (!text || text.trim().length === 0) {
              return NextResponse.json(
                { 
                  success: false, 
                  error: 'PDF-ul nu conține text sau nu s-a putut extrage textul. Te rog verifică că PDF-ul nu este protejat sau formatat doar cu imagini.' 
                },
                { status: 400 }
              );
            }
          } catch (pdfError: any) {
            console.error('Error processing PDF:', pdfError);
            return NextResponse.json(
              { 
                success: false, 
                error: pdfError.message || 'Nu am putut încărca documentele PDF. Încearcă din nou sau contactează un administrator.' 
              },
              { status: 400 }
            );
          }
        } else if (sourceType === 'csv') {
          text = buffer.toString('utf-8');
          const csvData = parseCSV(text);
          
          // Procesează CSV cu AI pentru a transforma datele în format standard
          const csvText = JSON.stringify(csvData);
          extractedProducts = await extractProductsWithAI(csvText, 'csv');
        } else {
          // Pentru alte tipuri de fișiere, încearcă să extragă text
          text = buffer.toString('utf-8');
        }
      } else if (url) {
        // Descarcă și procesează URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Eroare la descărcarea URL-ului: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (url.endsWith('.pdf') || sourceType === 'pdf') {
          try {
            const extraction = await extractTextFromPDF(buffer);
            text = extraction.text;
            
            if (!text || text.trim().length === 0) {
              return NextResponse.json(
                { 
                  success: false, 
                  error: 'PDF-ul nu conține text sau nu s-a putut extrage textul. Te rog verifică că PDF-ul nu este protejat sau formatat doar cu imagini.' 
                },
                { status: 400 }
              );
            }
          } catch (pdfError: any) {
            console.error('Error processing PDF from URL:', pdfError);
            return NextResponse.json(
              { 
                success: false, 
                error: pdfError.message || 'Nu am putut încărca documentele PDF. Încearcă din nou sau contactează un administrator.' 
              },
              { status: 400 }
            );
          }
        } else if (url.endsWith('.csv') || sourceType === 'csv') {
          text = buffer.toString('utf-8');
          const csvData = parseCSV(text);
          const csvText = JSON.stringify(csvData);
          extractedProducts = await extractProductsWithAI(csvText, 'csv');
        } else {
          text = buffer.toString('utf-8');
        }
      }

      // Dacă nu s-au extras produse din CSV, procesează textul cu AI
      if (extractedProducts.length === 0 && text) {
        extractedProducts = await extractProductsWithAI(text, sourceType);
      }

      // Salvează importul (ignoră erorile de storage dacă nu există bucket-ul)
      let importId: string | null = null;
      try {
        importId = await saveImport(
          sourceType,
          url,
          file?.name || null,
          'completed',
          extractedProducts,
          null
        );
      } catch (saveError: any) {
        // Ignoră erorile de storage bucket dacă nu există bucket-ul
        if (saveError?.message?.includes('Bucket not found') || saveError?.message?.includes('storage')) {
          console.warn('⚠️ [Import] Storage bucket not found, skipping import save:', saveError.message);
        } else {
          // Re-throw alte erori
          throw saveError;
        }
      }

      // Dacă autoCreate este activat, creează produsele automat DIRECT în acest API
      let autoCreated = false;
      let createdCount = 0;
      
      if (autoCreate && extractedProducts.length > 0 && userId) {
        try {
          console.log(`🔵 [AutoCreate] Starting auto-create for ${extractedProducts.length} products, userId: ${userId}`);
          
          // Importă funcțiile necesare pentru creare produse
          const { slugify, generateUniqueSlug } = await import('@/lib/slugify');
          
          // Creează produsele direct folosind supabaseAdmin
          const createdProducts: string[] = [];
          
          for (const productData of extractedProducts) {
            try {
              // Generează slug unic
              const baseSlug = slugify(productData.title);
              
              // Obține slug-urile existente din baza de date pentru a verifica unicitatea
              let existingSlugs: string[] = [];
              if (supabaseAdmin) {
                try {
                  const { data: existingProducts } = await supabaseAdmin!
                    .from('products')
                    .select('slug')
                    .not('slug', 'is', null);
                  
                  if (existingProducts) {
                    existingSlugs = existingProducts.map((p: any) => p.slug).filter(Boolean);
                  }
                } catch (error) {
                  console.warn('⚠️ [AutoCreate] Could not fetch existing slugs, using empty array:', error);
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
                sku = generateRandomSuffix(SKU_TOTAL_LENGTH);
              }

              // Calculează prețurile în ambele monede
              const exchangeRate = productData.currency === 'EUR' ? 5.0 : 1.0;
              const startingPriceRON = productData.currency === 'RON' 
                ? productData.startingPrice 
                : productData.startingPrice * exchangeRate;
              const startingPriceEUR = productData.currency === 'EUR'
                ? productData.startingPrice
                : productData.startingPrice / exchangeRate;

              console.log(`🔵 [AutoCreate] Creating product: ${productData.title} for userId: ${userId}`);

              const rawImages: string[] =
                Array.isArray(productData.images) && productData.images.length > 0
                  ? productData.images
                  : [
                      generateImageUrl(
                        productData.category,
                        productData.subcategory,
                        productData.location,
                        productData.city,
                        productData.county
                      ),
                    ];
              const productInsertData = {
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
                status: 'active', // Produsele sunt salvate PERMANENT și active imediat
                county: productData.county || null,
                city: productData.city || null,
                address: productData.address || null,
                auction_date: productData.auctionDate || null,
                images: rawImages,
                documents: productData.documents || [],
                slug: uniqueSlug,
                url: `/licitatii-publice/${uniqueSlug}`,
                custom_fields: {
                  ...productData,
                  imported_from: 'executor_import',
                  imported_at: new Date().toISOString(),
                },
                user_id: userId, // CRITICAL: Set user_id pentru executor
              };

              console.log(`🔵 [AutoCreate] Insert data:`, {
                title: productInsertData.title,
                user_id: productInsertData.user_id,
                status: productInsertData.status,
                product_type: productInsertData.product_type,
              });

              // Creează produsul folosind supabaseAdmin
              const { data: productDataResult, error: productError } = await supabaseAdmin!
                .from('products')
                .insert(productInsertData as any)
                .select('id, user_id, status, title, product_type')
                .single();

              if (productError) {
                console.error(`❌ [AutoCreate] Error creating product "${productData.title}":`, productError);
                console.error(`❌ [AutoCreate] Error details:`, JSON.stringify(productError, null, 2));
              } else if (productDataResult) {
                const productResult = productDataResult as any;
                createdProducts.push(productResult.id);
                createdCount++;
                console.log(`✅ [AutoCreate] Product created successfully:`, {
                  id: productResult.id,
                  title: productResult.title,
                  user_id: productResult.user_id,
                  status: productResult.status,
                  product_type: productResult.product_type,
                });
                if (supabaseAdmin && rawImages.length > 0) {
                  await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
                    productId: productResult.id,
                    userId,
                    imageUrls: rawImages,
                  });
                }
              } else {
                console.warn(`⚠️ [AutoCreate] No data returned for product "${productData.title}"`);
              }
            } catch (error: any) {
              console.error(`❌ [AutoCreate] Error creating product "${productData.title}":`, error);
            }
          }

          if (createdCount > 0) {
            autoCreated = true;
            console.log(`✅ [AutoCreate] Successfully created ${createdCount} products for userId: ${userId}`);
          } else {
            console.warn(`⚠️ [AutoCreate] No products were created despite autoCreate being true`);
          }
        } catch (error: any) {
          console.error('❌ [AutoCreate] Error in auto-create process:', error);
        }
      } else if (autoCreate && !userId) {
        console.warn('⚠️ [AutoCreate] Cannot auto-create products: userId not found');
      }

      return NextResponse.json({
        success: true,
        importId: importId || null,
        products: extractedProducts,
        autoCreated,
        createdCount: autoCreated ? createdCount : 0,
        userId: userId, // Return userId for debugging
        message: autoCreated 
          ? `Procesare reușită! ${createdCount} produse au fost create automat pentru executor.`
          : `Procesare reușită! Găsite ${extractedProducts.length} produse.`,
      });
    } catch (error: any) {
      console.error('Error processing import:', error);
      
      // Salvează importul cu status failed (ignoră erorile de storage dacă nu există bucket-ul)
      try {
        await saveImport(
          sourceType,
          url,
          file?.name || null,
          'failed',
          null,
          error.message
        );
      } catch (saveError: any) {
        // Ignoră erorile de storage bucket dacă nu există bucket-ul
        if (saveError?.message?.includes('Bucket not found') || saveError?.message?.includes('storage')) {
          console.warn('⚠️ [Import] Storage bucket not found, skipping failed import save:', saveError.message);
        } else {
          console.error('Error saving failed import:', saveError);
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Eroare la procesarea importului',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in import process:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Eroare necunoscută',
      },
      { status: 500 }
    );
  }
}
