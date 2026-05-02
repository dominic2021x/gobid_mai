/**
 * Parser pentru pagini de produs OLX.ro (anunțuri auto / piese)
 * Extrage: titlu, preț, monedă, imagini, descriere, specificații.
 * Același format ca pieseauto pentru a fi folosit în import piese auto.
 */

import * as cheerio from "cheerio";

export interface OlxProduct {
  title: string;
  price: number | null;
  currency: string;
  imageUrls: string[];
  description: string;
  specifications: Record<string, string>;
  livrareSiPlata: string;
  url: string;
  externalId: string | null;
}

function trimText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Respinge text care arată a CSS, class names sau junk (ex: .css-1f8vyal{...). */
function isValidDescription(text: string): boolean {
  if (!text || text.length < 15) return false;
  const t = text.trim();
  if (/^\.css-|^\.[a-z]+-\d+/i.test(t)) return false;
  if (/\{[^}]*\}|\.css-\w+\s*\{/.test(t)) return false;
  if (/^[.#\[\]{}\s\-_0-9a-z]+$/i.test(t) && t.length < 100) return false;
  const wordCount = (t.match(/[\p{L}\p{N}]+/gu) || []).length;
  return wordCount >= 3;
}

function toAbsolute(url: string, base: string): string {
  if (!url || url.startsWith("data:")) return "";
  if (url.startsWith("http")) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** Exclude iconițe UI OLX (fullscreen, expand, share etc.) – nu sunt poze de produs. */
function isOlxUiIconUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    /fullscreen|expand|maximize|minimize|resize/i.test(lower) ||
    /(^|\/)(icon|icons|svg|arrow|share|close|zoom|fullscreen)([._-]|$)/i.test(lower) ||
    /olx\.ro.*\.(svg|ico)(\?|$)/i.test(lower)
  );
}

/**
 * Verifică dacă HTML-ul este pagină de eroare sau blocare.
 */
export function isOlxErrorOrBlockPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    /pagina nu a fost găsită|404|not found/i.test(html) ||
    /anunțul nu mai este disponibil/i.test(html) ||
    /te rugăm să activezi javascript/i.test(lower) ||
    /access denied|blocked/i.test(lower)
  );
}

/**
 * Parsează o pagină de anunț OLX.ro.
 * Folosește og:*, h4/h3 pentru titlu/preț, secțiuni SPECIFICAȚII și Descriere.
 */
export function parseOlxProductPage(html: string, pageUrl: string): OlxProduct {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;

  const result: OlxProduct = {
    title: "",
    price: null,
    currency: "RON",
    imageUrls: [],
    description: "",
    specifications: {},
    livrareSiPlata: "",
    url: pageUrl,
    externalId: null,
  };

  // Încercare extragere din JSON-LD (uneori OLX pune date în script type="application/ld+json")
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const item = json["@graph"]?.[0] ?? json;
      if (item["@type"] === "Product" || item.name) {
        if (item.name && !result.title) result.title = trimText(String(item.name));
        const jsonDesc = trimText(String(item.description || ""));
        if (jsonDesc && isValidDescription(jsonDesc)) result.description = jsonDesc;
        if (item.image) {
          const imgs = Array.isArray(item.image) ? item.image : [item.image];
          imgs.forEach((src: string) => {
            const abs = toAbsolute(src, base);
            if (abs && !result.imageUrls.includes(abs) && !isOlxUiIconUrl(abs)) result.imageUrls.push(abs);
          });
        }
        const offers = item.offers ?? item.offers?.[0];
        if (offers && result.price == null) {
          const p = offers.price ?? offers.lowPrice;
          if (p != null) result.price = parseFloat(String(p));
          const c = offers.priceCurrency ?? "";
          if (c) result.currency = String(c).toUpperCase().slice(0, 3);
        }
      }
    } catch {
      // ignoră JSON invalid
    }
  });

  // ID din URL (ex: IDiz4NM.html sau -IDiz4NM.html)
  const idMatch = pageUrl.match(/[-]?ID([A-Za-z0-9]+)(?:\.html)?/i);
  if (idMatch) result.externalId = idMatch[1];

  // Titlu: og:title, [data-cy="ad_title"], h1, h4
  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle) result.title = trimText(ogTitle);
  if (!result.title) {
    const sel = $('[data-cy="ad_title"], h1, h4').first();
    if (sel.length) result.title = trimText(sel.text());
  }
  if (!result.title) {
    const sel = $("[class*='title'], [class*='Title']").first();
    if (sel.length) result.title = trimText(sel.text());
  }
  if (!result.title) result.title = "Produs auto OLX";
  // Curățare: elimină sufixul OLX din titlu (ex: "Titlu • OLX.ro")
  result.title = result.title.replace(/\s*[•\-|]\s*OLX\.ro\s*$/i, "").trim() || result.title;

  // Preț: [data-cy="ad_price"], h3 cu "lei"/"RON", text cu număr + lei/RON
  const priceSel = $('[data-cy="ad_price"], .price, h3').filter((_, el) => {
    const t = $(el).text();
    return /\d+\s*(lei|ron|eur)/i.test(t);
  }).first();
  const priceText = priceSel.length ? trimText(priceSel.text()) : "";
  const priceMatch = priceText.match(/(\d+(?:[\s.,]\d+)*)\s*(lei|ron|eur)?/i) ?? $("body").text().match(/(\d+(?:[\s.,]\d+)*)\s*(lei|ron|eur)/i);
  if (priceMatch) {
    const num = parseFloat(priceMatch[1].replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(num)) result.price = num;
    const curr = (priceMatch[2] || "").toLowerCase();
    if (curr === "eur") result.currency = "EUR";
    else result.currency = "RON"; // lei = Lei
  }

  // Poze: og:image, [data-cy="ad_photos"] img, galerii – excludem iconițe UI OLX (fullscreen, expand etc.)
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    const abs = toAbsolute(ogImage, base);
    if (abs && !isOlxUiIconUrl(abs)) result.imageUrls.push(abs);
  }

  $('meta[property="og:image"]').each((_, el) => {
    const src = $(el).attr("content");
    if (src) {
      const abs = toAbsolute(src, base);
      if (abs && !result.imageUrls.includes(abs) && !isOlxUiIconUrl(abs)) result.imageUrls.push(abs);
    }
  });

  const imgSelectors = [
    '[data-cy="ad_photos"] img',
    '[data-cy="adPhotos"] img',
    ".gallery img",
    "[class*='gallery'] img",
    "[class*='Photo'] img",
    "[class*='image'] img",
    "img[src*='olx.ro']",
  ];
  for (const sel of imgSelectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      if ($el.closest("button, [role='button'], [aria-label*='fullscreen'], [aria-label*='expand'], [class*='fullscreen'], [class*='expand']").length) return;
      const src = $el.attr("src") || $el.attr("data-src");
      if (src) {
        const abs = toAbsolute(src, base);
        if (abs && !result.imageUrls.includes(abs) && !isOlxUiIconUrl(abs)) result.imageUrls.push(abs);
      }
    });
  }

  // Descriere: og:description (cel mai curat), apoi JSON-LD, apoi DOM – doar dacă nu e CSS/junk
  const ogDesc = $('meta[property="og:description"]').attr("content");
  if (ogDesc) {
    const d = trimText(ogDesc);
    if (isValidDescription(d)) result.description = d;
  }

  const descSel = $('[data-cy="ad_description"], [data-cy="adDescription"]').first();
  if (descSel.length) {
    const t = trimText(descSel.text());
    if (isValidDescription(t) && t.length > result.description.length) result.description = t;
  }
  $("h2, h3, h4, strong").each((_, el) => {
    const $h = $(el);
    if (/descriere/i.test(trimText($h.text()))) {
      const next = $h.next();
      const container = $h.parent();
      const body = next.length ? trimText(next.text()) : trimText(container.text());
      if (body && isValidDescription(body) && body.length > result.description.length) result.description = body;
      return false;
    }
  });
  $("[class*='description'], [class*='Description'], [id*='descriere']").each((_, el) => {
    const t = trimText($(el).text());
    if (isValidDescription(t) && t.length > result.description.length) result.description = t;
  });

  // Specificații: secțiune SPECIFICAȚII – OLX afișează perechi Label / Valoare (ex: Marca → Mercedes-Benz)
  $("h2, h3, h4, strong").each((_, el) => {
    const $h = $(el);
    if (!/specifica[ii]|specs/i.test(trimText($h.text()))) return;
    const container = $h.closest("div, section").length ? $h.closest("div, section") : $h.parent();
    // Perechi din liste / tabele cu "Key: Value"
    container.find("ul li, div[class*='item'], p").each((_, item) => {
      const text = trimText($(item).text());
      const colon = text.indexOf(":");
      if (colon > 0) {
        const key = text.slice(0, colon).trim();
        const val = text.slice(colon + 1).trim();
        if (key && val) result.specifications[key] = val;
      }
    });
    container.find("tr").each((_, tr) => {
      const cells = $(tr).find("td, th");
      if (cells.length >= 2) {
        const key = trimText(cells.eq(0).text());
        const val = trimText(cells.eq(1).text());
        if (key && val) result.specifications[key] = val;
      }
    });
    // OLX: elemente între SPECIFICAȚII și următorul heading (Descriere) – perechi label/valoare pe rânduri
    const specBlock = $h.nextUntil("h2, h3, h4, strong");
    const lines: string[] = [];
    specBlock.each((_, node) => {
      const t = trimText($(node).text());
      if (t && !/specifica[ii]|specs/i.test(t)) lines.push(t);
    });
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const key = lines[i];
      const val = lines[i + 1];
      if (key && val && val.length < 200) result.specifications[key] = val;
    }
    // Fallback: textul secțiunii, tăiat la "Descriere", split pe newline
    if (Object.keys(result.specifications).length === 0) {
      const blockText = trimText(container.text());
      const descriereIdx = blockText.toLowerCase().indexOf("descriere");
      const specText = descriereIdx >= 0 ? blockText.slice(0, descriereIdx) : blockText;
      const parts = specText.split(/\n+/).map((l) => trimText(l)).filter(Boolean);
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const key = parts[i];
        const val = parts[i + 1];
        if (key && val && !/specifica[ii]|specs/i.test(key) && val.length < 200) {
          result.specifications[key] = val;
        }
      }
    }
    return false;
  });
  $("[class*='specificatii'] li, [class*='specifications'] li").each((_, li) => {
    const text = trimText($(li).text());
    const colon = text.indexOf(":");
    if (colon > 0) {
      const key = text.slice(0, colon).trim();
      const val = text.slice(colon + 1).trim();
      if (key && val) result.specifications[key] = val;
    }
  });

  // La OLX nu extragem Livrare/plată – nu e relevant pentru anunț; utilizatorul nu vrea câmpul.
  result.livrareSiPlata = "";

  return result;
}
