/**
 * Converts a string to a SEO-friendly URL slug
 * @param text - The text to convert (e.g., product title)
 * @returns SEO-friendly slug (e.g., "apartament-3-camere-bucuresti")
 */
export function slugify(text: string): string {
  if (!text) return '';
  
  // Convert to lowercase
  let slug = text.toLowerCase();
  
  // Remove Romanian diacritics
  const diacriticsMap: { [key: string]: string } = {
    'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't',
    'Ă': 'a', 'Â': 'a', 'Î': 'i', 'Ș': 's', 'Ț': 't',
  };
  
  for (const [diacritic, replacement] of Object.entries(diacriticsMap)) {
    slug = slug.replace(new RegExp(diacritic, 'g'), replacement);
  }
  
  // Remove special characters, keep only letters, numbers, spaces, and hyphens
  slug = slug.replace(/[^a-z0-9\s-]/g, '');
  
  // Replace multiple spaces or hyphens with single hyphen
  slug = slug.replace(/[\s-]+/g, '-');
  
  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');
  
  // Limit length to 100 characters for SEO
  if (slug.length > 100) {
    slug = slug.substring(0, 100);
    // Remove trailing hyphen if exists
    slug = slug.replace(/-+$/, '');
  }
  
  return slug;
}

/**
 * Generates a unique slug by checking if it already exists
 * @param baseSlug - The base slug
 * @param existingSlugs - Array of existing slugs
 * @param productId - Optional product ID to append if needed
 * @returns Unique slug
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: string[],
  productId?: string
): string {
  if (!baseSlug) {
    // Fallback to product ID if no slug can be generated
    return productId ? `produs-${productId}` : `produs-${Date.now()}`;
  }
  
  let uniqueSlug = baseSlug;
  let counter = 1;
  
  // Check if slug exists and make it unique
  while (existingSlugs.includes(uniqueSlug)) {
    // Try with counter first
    const slugWithCounter = `${baseSlug}-${counter}`;
    if (!existingSlugs.includes(slugWithCounter)) {
      uniqueSlug = slugWithCounter;
      break;
    }
    counter++;
    
    // If counter gets too high, use product ID
    if (counter > 100 && productId) {
      uniqueSlug = `${baseSlug}-${productId}`;
      break;
    }
  }
  
  return uniqueSlug;
}

