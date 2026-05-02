/**
 * RAG with Supabase (pgvector-first) + fallback text search + optional Pinecone
 *
 * Ce repară/îmbunătățește față de varianta ta:
 * - Nu mai folosește `.or(...).or(...)` (logica ta era greșită: al doilea `.or()` îți strica filtrarea)
 * - Nu mai concatenează unsafe string-uri în `ilike` (minimizăm riscul de query break / injection-like)
 * - Suportă "collections" / tipuri (products/pages) în mod explicit
 * - Preferă vector search prin RPC (match_*), iar dacă RPC nu există -> fallback la `ilike`
 * - Normalizează tipurile metadata (ai folosit subcategory/image fără să fie în interfață)
 */

import { generateEmbedding } from "@/utils/embeddings";
import { supabaseAdmin } from "@/lib/supabase";

export type ResultType = "product" | "page";

export interface SearchResult {
  id: string;
  text: string;
  source: string;
  score: number; // 0..1
  type: ResultType;
  metadata?: {
    title?: string;
    description?: string;
    url?: string;
    category?: string;
    subcategory?: string;
    price?: number;
    image?: string | null;
  };
}

export interface RetrieveFilter {
  type?: ResultType | "mixed";
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  // extensibil: status, approval etc
}

/**
 * Escape minim pentru LIKE/ILIKE ca să nu-ți pice query-ul din cauza % / _ / backslash
 * (PostgREST folosește SQL LIKE semantics)
 */
function escapeLike(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Alege ce colecții (tabele) căutăm.
 * - products: tabel `products`
 * - pages: tabel `pages` (presupunere standard; dacă la tine e alt nume, schimbă aici)
 */
function resolveTypes(filter?: RetrieveFilter): ResultType[] {
  const t = filter?.type;
  if (!t || t === "mixed") return ["product", "page"];
  return [t];
}

/**
 * Încearcă vector search prin RPC.
 * Presupune că ai RPC-uri:
 * - match_products(query_embedding vector, match_count int, filter_category text, min_price numeric, max_price numeric)
 * - match_pages(query_embedding vector, match_count int)
 *
 * Dacă nu există, va da eroare și mergem pe fallback.
 *
 * IMPORTANT: adaptează numele RPC și câmpurile returnate la schema ta.
 */
async function trySupabaseVectorSearch(params: {
  query: string;
  topK: number;
  filter?: RetrieveFilter;
}): Promise<SearchResult[] | null> {
  if (!supabaseAdmin) return null;

  const { query, topK, filter } = params;
  const types = resolveTypes(filter);

  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (e) {
    // dacă embeddings pică, nu blocăm tot; mergem pe fallback text
    return null;
  }

  const results: SearchResult[] = [];

  // products
  if (types.includes("product")) {
    try {
      const { data, error } = await supabaseAdmin.rpc("match_products", {
        query_embedding: embedding,
        match_count: topK,
        filter_category: filter?.category ?? null,
        min_price: filter?.minPrice ?? null,
        max_price: filter?.maxPrice ?? null,
      });

      if (error) throw error;

      // Așteptat: data items cu { id, title, description, category, subcategory, starting_price_ron, url, slug, images, similarity }
      (data || []).forEach((row: any) => {
        const url =
          (typeof row.url === "string" && row.url.length > 0)
            ? row.url
            : (typeof row.slug === "string" && row.slug.length > 0)
            ? `/licitatii-publice/${row.slug}`
            : `/licitatii-publice/${row.id}`;

        const imageUrl =
          Array.isArray(row.images) && row.images.length > 0
            ? (typeof row.images[0] === "string" ? row.images[0] : row.images[0]?.url)
            : null;

        const similarity = typeof row.similarity === "number" ? row.similarity : 0;
        const score = clamp01(similarity); // presupunem 0..1 din pgvector cosine

        results.push({
          id: String(row.id ?? ""),
          text: `${row.title ?? ""}. ${row.description ?? ""}`.trim(),
          source: url,
          score,
          type: "product",
          metadata: {
            title: row.title ?? undefined,
            description: row.description ?? undefined,
            url,
            category: row.category ?? undefined,
            subcategory: row.subcategory ?? undefined,
            price: typeof row.starting_price_ron === "number" ? row.starting_price_ron : undefined,
            image: imageUrl,
          },
        });
      });
    } catch {
      // RPC lipsește sau a dat eroare -> fallback
      return null;
    }
  }

  // pages
  if (types.includes("page")) {
    try {
      const { data, error } = await supabaseAdmin.rpc("match_pages", {
        query_embedding: embedding,
        match_count: topK,
      });

      if (error) throw error;

      // Așteptat: { id, title, content, url, similarity }
      (data || []).forEach((row: any) => {
        const similarity = typeof row.similarity === "number" ? row.similarity : 0;
        const score = clamp01(similarity);

        results.push({
          id: String(row.id ?? ""),
          text: `${row.title ?? ""}. ${row.content ?? ""}`.trim(),
          source: row.url ?? "",
          score,
          type: "page",
          metadata: {
            title: row.title ?? undefined,
            description: row.content ?? undefined,
            url: row.url ?? undefined,
          },
        });
      });
    } catch {
      return null;
    }
  }

  // sort + slice topK total (nu per-type)
  return results
    .filter((r) => r.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Fallback text search în Supabase.
 * Folosește ILIKE cu escaping minimal.
 * IMPORTANT: dacă vrei "search" mai bun, fă un `tsvector` + websearch_to_tsquery în DB.
 */
async function supabaseTextSearch(params: {
  query: string;
  topK: number;
  filter?: RetrieveFilter;
}): Promise<SearchResult[]> {
  if (!supabaseAdmin) return [];

  const { query, topK, filter } = params;
  const types = resolveTypes(filter);

  const q = query.trim();
  if (!q) return [];

  const like = `%${escapeLike(q)}%`;

  const results: SearchResult[] = [];

  // PRODUCTS
  if (types.includes("product")) {
    let qb = supabaseAdmin
      .from("products")
      .select("id, title, description, category, subcategory, starting_price_ron, images, url, slug, status, approval_status")
      // Căutare: un singur `.or(...)` pe câmpuri, nu multiple `.or()`
      // Notă: PostgREST acceptă "or" cu expresii separate prin virgule.
      .or(
        [
          `title.ilike.${like}`,
          `description.ilike.${like}`,
          `category.ilike.${like}`,
          `subcategory.ilike.${like}`,
        ].join(",")
      )
      // status/approval: filtre corecte, NU `.or('status.eq.active,approval_status.eq.approved')`
      // Pentru "active OR approved", trebuie `.or(...)` separat:
      .or("status.eq.active,approval_status.eq.approved")
      .not("title", "is", null)
      .not("description", "is", null)
      .limit(Math.max(topK * 3, 10));

    if (filter?.category) {
      // category OR subcategory == filter.category
      qb = qb.or(`category.eq.${filter.category},subcategory.eq.${filter.category}`);
    }
    if (filter?.minPrice !== undefined) qb = qb.gte("starting_price_ron", filter.minPrice);
    if (filter?.maxPrice !== undefined) qb = qb.lte("starting_price_ron", filter.maxPrice);

    const { data, error } = await qb;
    if (!error && data?.length) {
      const lower = q.toLowerCase();

      data.forEach((product: any) => {
        const title = String(product.title ?? "");
        const desc = String(product.description ?? "");
        const cat = String(product.category ?? "");
        const sub = String(product.subcategory ?? "");

        // scoring simplu (text). Ține minte: e fallback; vector search e recomandat.
        const titleMatch = title.toLowerCase().includes(lower) ? 0.8 : 0;
        const descMatch = desc.toLowerCase().includes(lower) ? 0.5 : 0;
        const categoryMatch = cat.toLowerCase().includes(lower) ? 0.3 : 0;
        const subcategoryMatch = sub.toLowerCase().includes(lower) ? 0.2 : 0;
        const score = clamp01(titleMatch + descMatch + categoryMatch + subcategoryMatch);

        const url =
          (typeof product.url === "string" && product.url.length > 0)
            ? product.url
            : (typeof product.slug === "string" && product.slug.length > 0)
            ? `/licitatii-publice/${product.slug}`
            : `/licitatii-publice/${product.id}`;

        const imageUrl =
          Array.isArray(product.images) && product.images.length > 0
            ? (typeof product.images[0] === "string" ? product.images[0] : product.images[0]?.url)
            : null;

        results.push({
          id: String(product.id ?? ""),
          text: `${title}. ${desc}`.trim(),
          source: url || "unknown",
          score,
          type: "product",
          metadata: {
            title,
            description: desc,
            url,
            category: product.category ?? undefined,
            subcategory: product.subcategory ?? undefined,
            price: typeof product.starting_price_ron === "number" ? product.starting_price_ron : undefined,
            image: imageUrl,
          },
        });
      });
    }
  }

  // PAGES (dacă ai tabel `pages`)
  if (types.includes("page")) {
    // dacă nu ai tabelul, lasă așa; va returna error și ignorăm
    const { data, error } = await supabaseAdmin
      .from("pages")
      .select("id, title, content, url")
      .or([`title.ilike.${like}`, `content.ilike.${like}`].join(","))
      .limit(Math.max(topK * 3, 10));

    if (!error && data?.length) {
      const lower = q.toLowerCase();
      data.forEach((page: any) => {
        const title = String(page.title ?? "");
        const content = String(page.content ?? "");
        const titleMatch = title.toLowerCase().includes(lower) ? 0.8 : 0;
        const contentMatch = content.toLowerCase().includes(lower) ? 0.5 : 0;
        const score = clamp01(titleMatch + contentMatch);

        results.push({
          id: String(page.id ?? ""),
          text: `${title}. ${content}`.trim(),
          source: page.url ?? "",
          score,
          type: "page",
          metadata: {
            title,
            description: content,
            url: page.url ?? undefined,
          },
        });
      });
    }
  }

  return results
    .filter((r) => r.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * API: retrieveContext
 *
 * - încearcă vector search (RPC) în Supabase
 * - fallback la text search (ILIKE)
 * - fallback la Pinecone dacă e configurat
 */
export async function retrieveContext(
  query: string,
  filter?: RetrieveFilter,
  topK: number = 5
): Promise<SearchResult[]> {
  try {
    // 1) Supabase vector search (recomandat)
    const vector = await trySupabaseVectorSearch({ query, topK, filter });
    if (vector && vector.length) return vector;

    // 2) Supabase text search fallback
    const text = await supabaseTextSearch({ query, topK, filter });
    if (text.length) return text;

    // 3) Pinecone fallback (opțional)
    try {
      const { queryVectors } = await import("@/lib/pinecone");
      const queryEmbedding = await generateEmbedding(query);
      const matches = await queryVectors(queryEmbedding, topK, filter);

      return (matches || [])
        .filter((m: any) => typeof m.score === "number" && m.score > 0.3)
        .map((m: any) => {
          const md = m.metadata || {};
          const textParts = [
            md.title || "",
            md.description || "",
            md.category ? `Categorie: ${md.category}` : "",
            md.price ? `Preț: ${md.price}` : "",
          ].filter(Boolean);

          return {
            id: String(m.id || ""),
            text: textParts.join(". ") || md.title || "",
            source: md.url || "",
            score: clamp01(Number(m.score || 0)),
            type: (md.type as ResultType) || "product",
            metadata: {
              title: md.title,
              description: md.description,
              url: md.url,
              category: md.category,
              subcategory: md.subcategory,
              price: md.price,
              image: md.image ?? null,
            },
          } as SearchResult;
        });
    } catch (pineconeError) {
      console.warn("Pinecone fallback failed:", pineconeError);
      return [];
    }
  } catch (error: any) {
    console.error("Error retrieving context:", error);
    return [];
  }
}

/**
 * Construiește context formatat pentru LLM
 */
export function buildContext(results: SearchResult[]): string {
  if (!results.length) return "Nu s-au găsit informații relevante în baza de date.";

  const parts = results.map((r, i) => {
    const title = r.metadata?.title ? `Titlu: ${r.metadata.title}\n` : "";
    const url = r.metadata?.url || r.source || "";
    const rel = `${(r.score * 100).toFixed(1)}%`;

    return `[${i + 1}] Tip: ${r.type}
${title}${r.text}
Sursă: ${url}
Relevanță: ${rel}`;
  });

  return `Informații relevante din baza de date:\n\n${parts.join("\n\n")}`;
}

/**
 * Construiește prompt complet pentru LLM
 * (Nota: în practică e mai bine să trimiți contextul ca mesaj separat, nu concatenat într-un string)
 */
export function buildPrompt(query: string, context: string, customSystemPrompt?: string): string {
  const systemPrompt =
    customSystemPrompt ||
    `Ești un asistent AI pentru platforma gobid.ro (licitații online).

Reguli:
- Răspunde în română, concis și util.
- Folosește informațiile din context. Dacă nu există context relevant, spune clar că nu ai găsit în baza de date și cere o clarificare scurtă.
- Dacă menționezi produse/pagini, include linkul (Sursă) când e disponibil.

${context ? `\nContext:\n${context}\n` : ""}`.trim();

  return `${systemPrompt}\n\nUtilizator: ${query}\n\nAsistent:`;
}
