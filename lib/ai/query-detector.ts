/**
 * Detectează tipul întrebării: produs sau pagină/site
 */

export type QueryType = 'product' | 'page' | 'both' | 'unknown';

/**
 * Detectează dacă întrebarea este despre produse sau pagini/site
 */
export function detectQueryType(query: string): QueryType {
  const lowerQuery = query.toLowerCase();
  
  // Cuvinte cheie pentru produse
  const productKeywords = [
    'produs', 'telefon', 'telefoane', 'laptop', 'tablet', 'cameră', 'camera',
    'bijuterie', 'bijuterii', 'ceas', 'ceasuri', 'mobilier', 'electronice',
    'electronice', 'telefoane sub', 'telefoane peste', 'telefoane între',
    'cumpăr', 'cumpar', 'văd', 'ved', 'arată', 'arata', 'arătă', 'arata',
    'show me', 'găsește', 'gaseste', 'caut', 'search', 'afișează', 'afiseaza',
    'preț', 'pret', 'price', 'cost', 'ieftin', 'scump', 'ofer', 'discount',
    'brand', 'model', 'specificații', 'specs'
  ];
  
  // Cuvinte cheie pentru pagini/site
  const pageKeywords = [
    'cum funcționează', 'functioneaza', 'how does', 'how to', 'cum să',
    'ghid', 'guide', 'tutorial', 'instrucțiuni', 'instructiuni', 'ajutor',
    'help', 'faq', 'întrebări', 'intrebari', 'termeni', 'condiții', 'conditii',
    'reguli', 'politica', 'policy', 'privacy', 'confidențialitate',
    'cont', 'account', 'profil', 'settings', 'setări', 'setari',
    'token', 'tokeni', 'credit', 'licita', 'licitație', 'licitatie',
    'suport', 'support', 'contact', 'despre', 'about', 'informații', 'informatii'
  ];
  
  // Verifică pentru produse (mai strict - trebuie să fie întrebare clară despre produse)
  const productMatches = productKeywords.filter(keyword => 
    lowerQuery.includes(keyword)
  ).length;
  
  // Verifică pentru pagini (mai generic - întrebări despre platformă)
  const pageMatches = pageKeywords.filter(keyword => 
    lowerQuery.includes(keyword)
  ).length;
  
  // Dacă are cuvinte despre produse și nu e despre pagini
  if (productMatches >= 2 || (productMatches >= 1 && pageMatches === 0)) {
    return 'product';
  }
  
  // Dacă are cuvinte despre pagini/site
  if (pageMatches >= 1) {
    return 'page';
  }
  
  // Dacă are ambele tipuri de cuvinte
  if (productMatches >= 1 && pageMatches >= 1) {
    return 'both';
  }
  
  // Default: necunoscut (va căuta în ambele colecții)
  return 'unknown';
}

/**
 * Verifică dacă întrebarea necesită căutare în produse
 */
export function isProductQuery(query: string): boolean {
  const type = detectQueryType(query);
  return type === 'product' || type === 'both';
}

/**
 * Verifică dacă întrebarea necesită căutare în pagini
 */
export function isPageQuery(query: string): boolean {
  const type = detectQueryType(query);
  return type === 'page' || type === 'both';
}

















