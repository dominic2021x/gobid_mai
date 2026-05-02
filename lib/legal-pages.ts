/** Lista paginilor legale din /legal/ - pentru layout și index */
export const LEGAL_NAV_PAGES = [
  { path: "/legal/termeni-si-conditii", title: "Termeni și Condiții" },
  { path: "/legal/politica-confidentialitate", title: "Politica de Confidențialitate" },
  { path: "/legal/politica-cookies", title: "Politica Cookie-uri" },
  { path: "/legal/date-identificare", title: "Date de identificare" },
] as const;

/** Lista completă pagini legale - pentru index extins și link-uri */
export const LEGAL_PAGES = [
  { slug: "termeni-si-conditii", path: "/legal/termeni-si-conditii", title: "Termeni și Condiții" },
  {
    slug: "termeni-import-sursa-externa",
    path: "/legal/termeni-import-sursa-externa",
    title: "Termeni import sursă externă (CSV)",
  },
  { slug: "politica-confidentialitate", path: "/legal/politica-confidentialitate", title: "Politica de Confidențialitate" },
  { slug: "politica-cookies", path: "/legal/politica-cookies", title: "Politica Cookie-uri" },
  { slug: "politica-licitatii", path: "/legal/politica-licitatii", title: "Politica de Licitații" },
  { slug: "politica-plati", path: "/legal/politica-plati", title: "Politica de Plăți și Rambursări" },
  { slug: "politica-moderare", path: "/legal/politica-moderare", title: "Politica de Moderare" },
  { slug: "politica-ai", path: "/legal/politica-ai", title: "Politica AI și Asistent" },
  { slug: "politica-consumatori", path: "/legal/politica-consumatori", title: "Politica Drepturi Consumatori" },
  { slug: "date-identificare", path: "/legal/date-identificare", title: "Date de identificare" },
] as const;
