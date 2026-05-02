import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Image similarity comparison using AI embeddings
 * Uses OpenAI Vision API for generating image embeddings
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * Downloads an image from URL and converts it to base64
 */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // Determine content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[Image Similarity] Error converting image to base64:', error);
    throw error;
  }
}

/**
 * Quick product type detection - identifies what type of product is in the image
 * Returns category and subcategory for fast filtering
 */
export async function detectProductType(imageUrl: string): Promise<{ category: string; subcategory: string } | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const base64Image = await imageUrlToBase64(imageUrl);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în clasificarea produselor. Analizează imaginea și identifică rapid tipul de produs. Răspunde DOAR cu categoria și subcategoria în format JSON: {"category": "categoria", "subcategory": "subcategoria"}. Categoriile posibile: autovehicule, electronice, imobiliare, utilaje, executari, diverse. Fii rapid și precis.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identifică rapid tipul de produs din această imagine. Răspunde DOAR cu JSON: {"category": "categoria", "subcategory": "subcategoria"}. Exemple: telefon -> {"category": "electronice", "subcategory": "telefoane"}, mașină -> {"category": "autovehicule", "subcategory": "autoturisme"}, apartament -> {"category": "imobiliare", "subcategory": "apartamente"}.',
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ],
      max_tokens: 100,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Try to parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: parsed.category || 'diverse',
          subcategory: parsed.subcategory || 'diverse',
        };
      }
    } catch {
      // If JSON parsing fails, try to extract from text
      const categoryMatch = content.match(/category["\s:]+"([^"]+)"/i) || content.match(/categoria["\s:]+"([^"]+)"/i);
      const subcategoryMatch = content.match(/subcategory["\s:]+"([^"]+)"/i) || content.match(/subcategoria["\s:]+"([^"]+)"/i);
      
      if (categoryMatch) {
        return {
          category: categoryMatch[1].toLowerCase(),
          subcategory: subcategoryMatch ? subcategoryMatch[1].toLowerCase() : 'diverse',
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Image Similarity] Error detecting product type:', error);
    return null;
  }
}

/**
 * Generates an embedding for an image using OpenAI Vision API
 * Returns a description/embedding that can be used for comparison
 */
async function getImageEmbedding(imageUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY nu este configurat pentru compararea imaginilor cu AI.');
  }

  try {
    // Convert image to base64
    const base64Image = await imageUrlToBase64(imageUrl);
    
    // Use OpenAI Vision to get a detailed description of the image
    // This description can be used for similarity comparison
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for cost efficiency
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în analiza imaginilor. Descrie imaginea în detaliu, incluzând: obiecte principale, culori, text vizibil, layout, stil, poziționare, fundal, și orice detalii distinctive. Descrierea trebuie să fie suficient de detaliată pentru a permite identificarea unei imagini similare sau identice.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descrie această imagine în detaliu, incluzând: obiecte principale și poziționarea lor, culori exacte, text vizibil (dacă există), layout și compoziție, stil și fundal, și orice detalii distinctive (stickere, QR codes, ambalaje, etc.). Fii foarte specific și detaliat pentru a permite identificarea unei imagini identice sau foarte similare.',
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const description = response.choices[0]?.message?.content || '';
    return description;
  } catch (error) {
    console.error('[Image Similarity] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Compares two images using AI-generated descriptions
 * Returns a similarity score between 0 and 1
 * Uses a more detailed comparison approach
 */
export async function compareImagesWithAI(
  imageUrl1: string,
  imageUrl2: string
): Promise<number> {
  try {
    // Get detailed descriptions for both images
    const [description1, description2] = await Promise.all([
      getImageEmbedding(imageUrl1),
      getImageEmbedding(imageUrl2),
    ]);

    // Use OpenAI to compare the descriptions with more detailed instructions
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Ești un expert în compararea imaginilor. Analizează două descrieri de imagini și determină cât de similare sunt.
          
Criterii de similaritate:
- 1.0 = imagini identice sau foarte aproape identice (același produs, același unghi, aceleași detalii)
- 0.9-0.99 = același produs dar unghiuri/detalii ușor diferite
- 0.8-0.89 = același produs dar diferențe vizibile (iluminare, unghi, fundal)
- 0.7-0.79 = produse similare dar nu identice
- 0.5-0.69 = produse din aceeași categorie dar diferite
- 0.0-0.49 = produse complet diferite

Răspunde DOAR cu un număr între 0.0 și 1.0, fără explicații sau text suplimentar.`,
        },
        {
          role: 'user',
          content: `Compară aceste două descrieri de imagini și determină similaritatea (0.0-1.0):

DESCRIERE IMAGINE 1:
${description1}

DESCRIERE IMAGINE 2:
${description2}

Răspunde DOAR cu un număr între 0.0 și 1.0 (ex: 0.95 sau 0.87).`,
        },
      ],
      max_tokens: 10,
      temperature: 0.1, // Slightly higher for more nuanced comparisons
    });

    const similarityText = response.choices[0]?.message?.content?.trim() || '0';
    // Extract number from response (in case there's extra text)
    const numberMatch = similarityText.match(/(\d+\.?\d*)/);
    const similarity = numberMatch ? parseFloat(numberMatch[1]) : parseFloat(similarityText);

    // Validate similarity score
    if (isNaN(similarity) || similarity < 0 || similarity > 1) {
      console.warn('[Image Similarity] Invalid similarity score, defaulting to 0:', similarityText);
      return 0;
    }

    console.log(`[Image Similarity] Similarity score: ${similarity.toFixed(3)} for images`);
    return similarity;
  } catch (error) {
    console.error('[Image Similarity] Error comparing images:', error);
    // Fallback to simple comparison if AI fails
    return 0;
  }
}

/**
 * Batch comparison - compares one image against multiple images
 * Returns array of similarity scores
 */
export async function compareImageBatch(
  searchImageUrl: string,
  productImageUrls: string[]
): Promise<Array<{ url: string; similarity: number }>> {
  try {
    // Get description for search image once
    const searchDescription = await getImageEmbedding(searchImageUrl);
    
    // Compare with all product images
    const comparisons = await Promise.all(
      productImageUrls.map(async (productUrl) => {
        try {
          const productDescription = await getImageEmbedding(productUrl);
          
          // Use OpenAI to compare
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Răspunde doar cu un număr între 0.0 și 1.0, fără explicații.',
              },
              {
                role: 'user',
                content: `Compară aceste două descrieri și determină similaritatea (0.0-1.0):

Imaginea 1: ${searchDescription}

Imaginea 2: ${productDescription}

Răspunde doar cu un număr între 0.0 și 1.0.`,
              },
            ],
            max_tokens: 10,
            temperature: 0,
          });

          const similarityText = response.choices[0]?.message?.content?.trim() || '0';
          const similarity = parseFloat(similarityText);
          
          return {
            url: productUrl,
            similarity: isNaN(similarity) || similarity < 0 || similarity > 1 ? 0 : similarity,
          };
        } catch (error) {
          console.error(`[Image Similarity] Error comparing with ${productUrl}:`, error);
          return { url: productUrl, similarity: 0 };
        }
      })
    );

    return comparisons;
  } catch (error) {
    console.error('[Image Similarity] Error in batch comparison:', error);
    return productImageUrls.map(url => ({ url, similarity: 0 }));
  }
}
