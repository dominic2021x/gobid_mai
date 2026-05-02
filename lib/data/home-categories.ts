/**
 * Shared category list for homepage. Used by HomeCategoriesSection (and optionally HomeClient).
 * Single source of truth to avoid duplication and keep sections in sync.
 */

export interface HomeCategoryItem {
  name: string;
  image: string;
  fallbackEmoji: string;
  gradient: string;
  href: string | null;
}

export const HOME_CATEGORY_ITEMS: HomeCategoryItem[] = [
  { name: "Executări și Insolvență", image: "/images/categories/category-executari-silite.jpg", fallbackEmoji: "⚖️", gradient: "from-slate-500 via-slate-600 to-slate-700", href: "/ro?category=executari" },
  { name: "Imobiliare", image: "/images/categories/category-imobiliare.jpg", fallbackEmoji: "🏠", gradient: "from-blue-500 to-blue-600", href: "/ro?category=imobiliare" },
  { name: "Autovehicule", image: "/images/categories/category-auto.jpg", fallbackEmoji: "🚗", gradient: "from-slate-600 to-gray-700", href: "/ro?category=autovehicule" },
  { name: "Piese auto", image: "/images/categories/category-piese-auto.jpg", fallbackEmoji: "🔧", gradient: "from-slate-500 to-gray-600", href: "/ro?category=autovehicule&subcategory=piese-auto" },
  { name: "Electronice & Tehnologie", image: "/images/categories/category-electronice.jpg", fallbackEmoji: "📱", gradient: "from-blue-400 via-blue-500 to-blue-500", href: "/ro?category=electronice" },
  { name: "Utilaje agricole", image: "/images/categories/category-utilaje-agricole.jpg", fallbackEmoji: "🚜", gradient: "from-amber-600 to-lime-500", href: "/ro?category=utilaje&subcategory=utilaje-agricole" },
  { name: "Artă & Antichități", image: "/images/categories/category-arta.jpg", fallbackEmoji: "🖼️", gradient: "from-amber-500 to-orange-600", href: "/ro?category=arta" },
  { name: "Utilaje & Echipamente", image: "/images/categories/category-utilaje.jpg", fallbackEmoji: "🚜", gradient: "from-lime-500 via-amber-400 to-emerald-500", href: "/ro?category=utilaje" },
  { name: "Mobilier", image: "/images/categories/category-mobilier.jpg", fallbackEmoji: "🪑", gradient: "from-amber-700 via-stone-500 to-amber-800", href: "/ro?category=casa&subcategory=mobilier-interior" },
  { name: "Modă & Lifestyle", image: "/images/categories/category-moda.jpg", fallbackEmoji: "👗", gradient: "from-rose-400 via-pink-500 to-blue-500", href: "/ro?category=moda" },
  { name: "Maritime & Aeronautice", image: "/images/categories/category-maritime.jpg", fallbackEmoji: "✈️", gradient: "from-cyan-500 via-blue-500 to-blue-600", href: "/ro?category=maritime" },
  { name: "Agricultură & Zootehnie", image: "/images/categories/category-agricultura.jpg", fallbackEmoji: "🌾", gradient: "from-amber-600 via-yellow-500 to-lime-500", href: "/ro?category=agricultura" },
  { name: "Mama și copilul", image: "/images/categories/category-mama-copil.jpg", fallbackEmoji: "👶", gradient: "from-pink-400 via-rose-400 to-blue-500", href: "/ro?category=mama-copil" },
  { name: "Materiale Construcții", image: "/images/categories/category-materiale.jpg", fallbackEmoji: "🧱", gradient: "from-stone-500 via-amber-700 to-orange-600", href: "/ro?category=materiale" },
  { name: "Diverse / Speciale", image: "/images/categories/category-diverse.jpg", fallbackEmoji: "✨", gradient: "from-blue-500 via-blue-500 to-blue-500", href: "/ro?category=diverse" },
  { name: "Mai multe", image: "", fallbackEmoji: "+", gradient: "from-gray-500 via-gray-600 to-gray-700", href: "/categorii" },
];
