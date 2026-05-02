/**
 * Verified dashboard routes for "Explain UI" only. No invented routes.
 */
export const UI_MAP = [
  { path: "/", label: "Homepage" },
  { path: "/ro", label: "Licitatii" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/dashboard/favorites", label: "Favorite" },
  { path: "/dashboard/ofertele_mele", label: "Ofertele mele" },
  { path: "/dashboard/my-products", label: "Anunțurile mele" },
  { path: "/dashboard/my-bids", label: "Licitațiile mele" },
  { path: "/dashboard/exclusiv", label: "Anunțuri exclusive" },
  { path: "/dashboard/tokens", label: "Token-uri" },
  { path: "/dashboard/settings", label: "Setări" },
  { path: "/dashboard/payments", label: "Plăți" },
  { path: "/dashboard/support", label: "Suport" },
  { path: "/dashboard/reviews", label: "Review-uri" },
  { path: "/dashboard/messages", label: "Mesaje" },
  { path: "/dashboard/assistant", label: "GO AI" },
] as const;

export const MANDATORY_FIELD_LABELS: Record<string, string> = {
  title: "Titlul anunțului",
  description: "Descrierea",
  category: "Categoria",
  subcategory: "Subcategoria",
  starting_price: "Prețul de pornire (mai mare decât 0)",
  currency: "Moneda (Lei sau EUR)",
};
