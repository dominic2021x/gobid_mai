/**
 * Parse detail page HTML from licitatii-insolventa.ro (server-only).
 * Extract title, category, price, publish date, custom fields, seller, description, images, PDFs.
 */

import * as cheerio from "cheerio";
import { extractAuctionDateAndTimeFromText } from "@/lib/extractAuctionFromDescription";

const BASE_URL = "https://www.licitatii-insolventa.ro";

export interface DetailParsed {
  externalId: string;
  title: string;
  priceText: string | null;
  category: string | null;
  locationRaw: string | null;
  publishedAt: Date | null;
  customFields: {
    dataLicitatie?: string;
    oraLicitatie?: string;
    dataLicitatie2?: string;
    oraLicitatie2?: string;
    tipVanzare?: string;
    [key: string]: string | undefined;
  };
  sellerName: string | null;
  sellerProfileUrl: string | null;
  sellerEmail: string | null;
  sellerPhone: string | null;
  sellerAddress: string | null;
  descriptionHtml: string | null;
  imageUrls: string[];
  pdfUrls: string[];
}

function trimText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toAbsolute(url: string, base: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : new URL(url, base).href;
}

/**
 * Parse dd/mm/yyyy in Europe/Bucharest to Date.
 */
function parseRoDate(dateStr: string): Date | null {
  const trimmed = trimText(dateStr);
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = parseInt(d!, 10);
  const month = parseInt(mo!, 10) - 1;
  const year = parseInt(y!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Extract external id from detail page URL or from text "ID anunt #172250".
 */
function extractExternalIdFromDetail(html: string, pageUrl: string): string {
  const fromUrl = pageUrl.match(/_i(\d+)(?:\?|$|#)/);
  if (fromUrl) return fromUrl[1];
  const $ = cheerio.load(html);
  const body = $("body").text();
  const fromText = body.match(/ID\s*anunt\s*#?\s*(\d+)/i);
  if (fromText) return fromText[1];
  const fallback = pageUrl.match(/(\d+)(?:\?|$|#)/);
  return fallback ? fallback[1] : "";
}

/**
 * Parse detail HTML and return structured data.
 */
export function parseDetailPage(html: string, pageUrl: string): DetailParsed {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;

  const externalId = extractExternalIdFromDetail(html, pageUrl);

  let title = "";
  const titleEl = $("h1, .detail-title, .annonce-title, #title").first();
  if (titleEl.length) title = trimText(titleEl.text());
  if (!title) {
    const h2InRight = $("#right h2").first();
    if (h2InRight.length) title = trimText(h2InRight.text());
  }

  let priceText: string | null = null;
  $(".item-details .elem").each((_, el) => {
    const $elem = $(el);
    if (/^Pre[tț]\s*$/i.test(trimText($elem.find(".left").text()))) {
      const val = trimText($elem.find(".right").text());
      if (val && val.length < 50) priceText = val;
      return false;
    }
  });
  if (!priceText) {
    const priceEl = $(".item-details .elem.price .right, .price, .pret, #price, .detail-price").first();
    if (priceEl.length) priceText = trimText(priceEl.text()) || null;
  }

  let category: string | null = null;
  // Zara/OsClass: .item-details .elem with .left "Categorie" -> .right (link text)
  $(".item-details .elem").each((_, el) => {
    const $elem = $(el);
    if (/^Categorie\s*$/i.test(trimText($elem.find(".left").text()))) {
      const right = $elem.find(".right");
      const link = right.find("a").first();
      const val = link.length ? trimText(link.text()) : trimText(right.text());
      if (val && val.length < 100) category = val;
      return false;
    }
  });
  if (!category) {
    const categoryEl = $(".category, .categorie, #category, [class*='categor'], .breadcrumb a").first();
    if (categoryEl.length) category = trimText(categoryEl.text()) || null;
  }
  if (!category) {
    const breadcrumbLinks = $(".breadcrumb ul.breadcrumb a[href*='/auto/'], .breadcrumb ul.breadcrumb a[href*='/imobiliare/'], .breadcrumb ul.breadcrumb a[href*='/altele/'], .breadcrumb ul.breadcrumb a[href*='/afaceri/'], .breadcrumb ul.breadcrumb a[href*='/industrial/'], .breadcrumb ul.breadcrumb a[href*='/office/']");
    const lastCat = breadcrumbLinks.last();
    if (lastCat.length) category = trimText(lastCat.find("span[itemprop='title']").text()) || trimText(lastCat.text()) || null;
  }
  if (!category) {
    $("td, dd, div, span").each((_, el) => {
      const $el = $(el);
      const text = $el.text();
      if (/^Categorie\s*:?\s*/i.test(trimText(text)) && $el.next().length) {
        const val = trimText($el.next().text());
        if (val && val.length < 100) category = val;
        return false;
      }
      if (/^Categorie\s*:?\s*/i.test(trimText(text))) {
        const val = trimText(text.replace(/^Categorie\s*:?\s*/i, ""));
        if (val && val.length < 100) category = val;
        return false;
      }
    });
  }
  if (!category) {
    $("a[href*='categorie']").each((_, el) => {
      const t = trimText($(el).text());
      if (t && t.length > 0 && t.length < 80) {
        category = t;
        return false;
      }
    });
  }
  if (!category) {
    $("table tr").each((_, tr) => {
      const th = trimText($(tr).find("th").first().text());
      if (/Categorie/i.test(th)) {
        const val = trimText($(tr).find("td").first().text());
        if (val && val.length < 100) category = val;
        return false;
      }
    });
  }
  if (!category) {
    try {
      const path = new URL(pageUrl).pathname;
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 2) {
        const last = segments[segments.length - 1];
        const beforeSlug = last.match(/_i\d+$/) ? segments[segments.length - 2] : segments[segments.length - 1];
        if (beforeSlug) {
          const name = beforeSlug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          if (name.length > 0 && name.length < 80) category = name;
        }
      }
    } catch {
      /* ignore */
    }
  }

  let publishedAt: Date | null = null;
  $(".item-details .elem").each((_, el) => {
    const $elem = $(el);
    if (/Data\s*publicare/i.test(trimText($elem.find(".left").text()))) {
      publishedAt = parseRoDate($elem.find(".right").text());
      return false;
    }
  });
  if (!publishedAt) {
    const dateEl = $(".published-at, .data-publicare, .date, [class*='publish']").first();
    if (dateEl.length) publishedAt = parseRoDate(dateEl.text());
  }
  if (!publishedAt) {
    $("meta[property='article:published_time']").each((_, el) => {
      const content = $(el).attr("content");
      if (content) {
        const d = new Date(content);
        if (!isNaN(d.getTime())) publishedAt = d;
      }
    });
  }

  const customFields: DetailParsed["customFields"] = {};
  // Extract ALL "Label: Value" from Informatii aditionale – un rând per .meta (Zara: .meta > .ins)
  function addMetaPair(text: string) {
    const t = trimText(text);
    if (!t || t.length > 500) return;
    const colonIdx = t.indexOf(":");
    if (colonIdx === -1) return;
    const label = t.slice(0, colonIdx).trim();
    const value = t.slice(colonIdx + 1).trim();
    if (!label || !value) return;
    customFields[label] = value;
    if (/Data\s*licita[tț]ie\s*2\s*$/i.test(label.trim())) customFields.dataLicitatie2 = value;
    else if (/Data\s*licita[tț]ie/i.test(label)) customFields.dataLicitatie = value;
    else if (/Dat[aă]\s*expirare/i.test(label)) customFields.dataLicitatie = value; // Dată expirare = data licitației
    else if (/Ora\s*licita[tț]ie\s*2\s*$/i.test(label.trim())) customFields.oraLicitatie2 = value;
    else if (/Ora\s*licita[tț]ie/i.test(label)) customFields.oraLicitatie = value;
    else if (/Tip\s*(?:Vanzare|v[âa]nzare)/i.test(label)) customFields.tipVanzare = value;
  }
  // Informatii aditionale: #custom_fields .meta_list .meta și .meta_list .meta (Label: Value în .ins)
  $("#custom_fields .meta_list .meta, .meta_list .meta").each((_, el) => {
    const $meta = $(el);
    const $ins = $meta.find(".ins").first();
    const text = $ins.length ? trimText($ins.text()) : trimText($meta.text());
    if (text) addMetaPair(text);
  });
  // Dacă sursa nu are "Data licitatie 2" / "Ora licitatie 2", copiem din cele principale ca să apară și în "2" (admin + meta_fields)
  if (customFields.dataLicitatie && !customFields.dataLicitatie2) {
    customFields.dataLicitatie2 = customFields.dataLicitatie;
    customFields["Data licitatie 2"] = customFields.dataLicitatie;
  }
  if (customFields.oraLicitatie && !customFields.oraLicitatie2) {
    customFields.oraLicitatie2 = customFields.oraLicitatie;
    customFields["Ora licitatie 2"] = customFields.oraLicitatie;
  }

  // Auto (Autoturisme, Camioane, Vehicule Utilitare etc.): și din .item-details .elem (label în .left, valoare în .right)
  const autoMetaLabels = /^(Marca|KM|Combustibil|An\s*fabricatie|Capacitate\s*cilindrica)$/i;
  $(".item-details .elem").each((_, el) => {
    const $elem = $(el);
    const left = trimText($elem.find(".left").text());
    const right = trimText($elem.find(".right").text());
    if (left && right && autoMetaLabels.test(left)) {
      const label = left.replace(/\s+/g, " ");
      if (!customFields[label]) customFields[label] = right;
    }
  });

  // Imobiliare (Apartamente si case, Cladiri, Terenuri, Teren cu cladire, Spatii etc.): din .item-details .elem
  const imobMetaLabels = /^(Suprafa[tț]a?|Tip\s*(imobil)?|Camere|An\s*constructie)$/i;
  $(".item-details .elem").each((_, el) => {
    const $elem = $(el);
    const left = trimText($elem.find(".left").text());
    const right = trimText($elem.find(".right").text());
    if (left && right && imobMetaLabels.test(left)) {
      const label = left.replace(/\s+/g, " ").trim();
      if (!customFields[label]) customFields[label] = right;
    }
  });

  let sellerName: string | null = null;
  let sellerProfileUrl: string | null = null;

  // Nume vânzător: prioritate 1 din formular (contact_name), altfel din link în .name (nu „Pagina membru”)
  const contactName = trimText($("input[name='contact_name']").attr("value") ?? "");
  if (contactName && contactName.length > 1) sellerName = contactName;
  if (!sellerName) {
    const nameLink = $(".seller .name a, .vanzator .name a, [class*='seller'] .name a, [class*='vanzator'] .name a").first();
    if (nameLink.length) {
      const t = trimText(nameLink.text());
      if (t && t.length > 1) sellerName = t;
      const href = nameLink.attr("href");
      if (href) sellerProfileUrl = toAbsolute(href, base);
    }
  }
  if (!sellerName) {
    $(".seller a, .vanzator a, [class*='seller'] a, [class*='vanzator'] a").each((_, el) => {
      const $a = $(el);
      const t = trimText($a.text());
      if (!t || /^Pagina\s+membru$/i.test(t) || t.length < 3) return;
      sellerName = t;
      const href = $a.attr("href");
      if (href) sellerProfileUrl = toAbsolute(href, base);
      return false; // break
    });
  }
  if (!sellerProfileUrl) {
    const anyProfileLink = $(".seller a[href*='profil'], .vanzator a[href*='profil'], [class*='seller'] a[href*='profil'], [class*='vanzator'] a[href*='profil']").first();
    if (anyProfileLink.length) sellerProfileUrl = toAbsolute(anyProfileLink.attr("href") ?? "", base);
  }
  if (!sellerName) {
    const sellerEl = $(".seller, .vanzator, [class*='seller'], [class*='vanzator']").first();
    if (sellerEl.length) sellerName = trimText(sellerEl.text()) || null;
  }

  let sellerEmail: string | null = null;
  let sellerPhone: string | null = null;
  let sellerAddress: string | null = null;

  // Form hidden inputs (print form / contact) – sursă fiabilă pentru email, telefon, adresă
  const contactEmail = trimText($("input[name='contact_email']").attr("value") ?? "");
  if (contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) sellerEmail = contactEmail;
  const contactPhone = trimText($("input[name='contact_phone']").attr("value") ?? "") || trimText($("input[name='mobil']").attr("value") ?? "");
  if (contactPhone && contactPhone.replace(/\D/g, "").length >= 10) sellerPhone = contactPhone;
  if (!sellerPhone) {
    const phoneRel = trimText($(".phone-show").attr("rel") ?? "");
    if (phoneRel && phoneRel.replace(/\D/g, "").length >= 10) sellerPhone = phoneRel;
  }
  const contactAddress = trimText($("input[name='contact_address']").attr("value") ?? "");
  if (contactAddress && contactAddress !== "-" && contactAddress.length > 1 && contactAddress.length < 500) sellerAddress = contactAddress;
  if (!sellerAddress) {
    const locParts: string[] = [];
    $("#location .loc-text .elem, #location .body .loc-text .elem").each((_, el) => {
      const t = trimText($(el).text());
      if (t && t.length > 0 && t.length < 200 && !locParts.includes(t)) locParts.push(t);
    });
    if (locParts.length > 0) sellerAddress = locParts.join(", ");
  }

  const sellerSection = $("[class*='seller'], [class*='vanzator'], [id*='seller'], [id*='vanzator']").first();
  const scope = sellerSection.length ? sellerSection.closest("div, section, aside") : $.root();
  const $scope = scope.length ? scope : $.root();
  if (!sellerEmail) {
    $scope.find("a[href^='mailto:']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          sellerEmail = email;
          return false;
        }
      }
    });
  }
  if (!sellerEmail) {
    $("a[href^='mailto:']").first().each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) sellerEmail = email;
      }
    });
  }
  const telLinks: string[] = [];
  $scope.find("a[href^='tel:']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const num = href.replace(/^tel:/i, "").replace(/\s+/g, "").replace(/[^\d+]/g, "");
      if (num.length >= 10) telLinks.push(num);
    }
  });
  if (telLinks.length === 0) {
    $("a[href^='tel:']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const num = href.replace(/^tel:/i, "").replace(/\s+/g, "").replace(/[^\d+]/g, "");
        if (num.length >= 10) telLinks.push(num);
      }
    });
  }
  if (!sellerPhone && telLinks.length > 0) sellerPhone = telLinks.join("; ");
  if (!sellerAddress) {
  $scope.find("*").each((_, el) => {
    if (sellerAddress) return false;
    const $el = $(el);
    const text = trimText($el.text());
    if (/^Localizare\s*:?\s*$/i.test(text) || trimText($el.find("label").first().text()) === "Localizare") {
      const next = $el.next();
      const addr = next.length ? trimText(next.text()) : trimText($el.parent().text().replace(/Localizare\s*:?\s*/i, "").trim());
      if (addr && addr.length > 5 && addr.length < 500) sellerAddress = addr;
      if (!sellerAddress && $el.parent().length) {
        const sibling = $el.siblings().first();
        if (sibling.length) sellerAddress = trimText(sibling.text()).slice(0, 400) || null;
      }
      return false;
    }
    return;
  });
  }
  if (!sellerAddress) {
    $("a[href*='maps'], [class*='location'], [class*='address'], [class*='adresa']").first().each((_, el) => {
      const t = trimText($(el).text());
      if (t.length > 10 && t.length < 400 && /[A-Za-z]/.test(t)) sellerAddress = t;
    });
  }

  let descriptionHtml: string | null = null;
  const minDescLen = 15;
  const minDescLenSubstantial = 20;

  // 1) Zara: există două div#more-info (Descriere + Related listings gol). #id returnează doar primul,
  //    deci nu ne bazăm pe id. Parcurgem TOATE .item-description.sc-block din pagină și luăm blocul cu cel mai mult text.
  let bestBlock = { html: "", len: 0 };
  $(".item-description.sc-block, .item-description").each((_, el) => {
    const $block = $(el);
    const html = $block.html();
    const textLen = trimText($block.text()).length;
    if (html && textLen >= minDescLenSubstantial && textLen > bestBlock.len) {
      bestBlock = { html: html.trim(), len: textLen };
    }
  });
  if (bestBlock.html) descriptionHtml = bestBlock.html;

  // 2) h2/h3 "Descriere" – următorul sibling (dacă blocul 1 nu a găsit nimic)
  if (!descriptionHtml) {
    $("h2, h3").each((_, el) => {
      if (descriptionHtml) return false;
      const $heading = $(el);
      if (!/^Descriere\s*$/i.test(trimText($heading.text()))) return;
      const next = $heading.next();
      if (next.length) {
        const html = next.html();
        const textLen = trimText(next.text()).length;
        if (html && textLen >= minDescLen) {
          descriptionHtml = html.trim();
          return false;
        }
      }
      const parts: string[] = [];
      let sib = $heading.next();
      while (sib.length) {
        const tag = sib.prop("tagName")?.toUpperCase();
        if (tag === "H2" || tag === "H3") break;
        const h = sib.html();
        if (h && trimText(sib.text()).length >= minDescLen) parts.push(h.trim());
        sib = sib.next();
      }
      if (parts.length > 0) descriptionHtml = parts.join("\n").trim();
      return false;
    });
  }

  const descSelectors = [
    "#itemDescription",
    "#description",
    "#plugin-details .content",
    ".content-detail",
    ".detail-description",
    "[id*='descriere']",
    "[id*='Description']",
    ".annonce-description",
    ".item-description",
    ".detail-content",
    ".post-content",
    "article .content",
    ".description",
    ".descriere",
    "[class*='descriere']",
    "[class*='description']",
  ];
  for (const sel of descSelectors) {
    if (descriptionHtml) break;
    const descBlock = $(sel).first();
    if (descBlock.length) {
      const html = descBlock.html();
      if (html && trimText(descBlock.text()).length >= minDescLen) descriptionHtml = html.trim();
    }
  }
  if (!descriptionHtml) {
    $("td, th, div, span, label").each((_, el) => {
      const $el = $(el);
      const text = trimText($el.text());
      if (/^Descriere\s*:?\s*$/i.test(text) || text === "Descriere") {
        let next = $el.next();
        if (next.length && next.prop("tagName")) {
          const h = next.html();
          if (h && trimText(next.text()).length >= minDescLen) descriptionHtml = h.trim();
        }
        const parent = $el.parent();
        if (!descriptionHtml && parent.length) {
          const rest = parent.clone().children().remove().end().text();
          if (trimText(rest).length >= 20) descriptionHtml = parent.html()?.trim() || null;
        }
        return false;
      }
    });
  }
  if (!descriptionHtml) {
    $("label, span, dt").each((_, el) => {
      const $el = $(el);
      if (!/Descriere/i.test($el.text())) return;
      const next = $el.next();
      if (next.length && next.html() && trimText(next.text()).length >= minDescLen) {
        descriptionHtml = next.html()?.trim() || null;
        return false;
      }
    });
  }
  if (!descriptionHtml) {
    $("table tr").each((_, tr) => {
      const th = trimText($(tr).find("th").first().text());
      if (!/Descriere/i.test(th)) return;
      const td = $(tr).find("td").first();
      if (td.length) {
        const h = td.html();
        if (h && trimText(td.text()).length >= minDescLen) descriptionHtml = h.trim();
        return false;
      }
    });
  }
  if (!descriptionHtml) {
    const $main = $("#itemDetail, #plugin-details, .item-detail, [id*='item-detail'], [class*='item-detail']").first();
    if ($main.length) {
      const $desc = $main.find("[id*='descriere'], [class*='descriere'], [id*='description'], [class*='description']").first();
      if ($desc.length) {
        const h = $desc.html();
        if (h && trimText($desc.text()).length >= minDescLen) descriptionHtml = h.trim();
      }
      if (!descriptionHtml) {
        const content = $main.find(".content, .item-description, .body").first();
        if (content.length && trimText(content.text()).length >= minDescLen) descriptionHtml = content.html()?.trim() || null;
      }
    }
  }
  // Ultimul fallback: în HTML brut, după </h2> sau </h3> care conține "Descriere", ia conținutul până la următorul tag
  if (!descriptionHtml) {
    const bodyText = $("body").html() || "";
    const descIdx = bodyText.search(/<h[23][^>]*>[\s\S]*?Descriere[\s\S]*?<\/h[23]>/i);
    if (descIdx >= 0) {
      const after = bodyText.slice(descIdx);
      const closeMatch = after.match(/<\/h[23]>\s*([\s\S]{50,}?)(?=<\/div>|<h[23]|$)/i);
      if (closeMatch) {
        const block = trimText(closeMatch[1].replace(/<!--[\s\S]*?-->/g, ""));
        if (block.length >= 50) descriptionHtml = block;
      }
    }
  }

  const imageUrls: string[] = [];
  $("#pictures .item-bxslider a[rel='image_group']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) imageUrls.push(toAbsolute(href, base));
  });
  if (imageUrls.length === 0) {
    $("#pictures .item-bxslider img, #pictures img, .gallery img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) imageUrls.push(toAbsolute(src, base));
    });
  }
  if (imageUrls.length === 0) {
    $("a[rel='image_group']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) imageUrls.push(toAbsolute(href, base));
    });
  }

  const pdfUrls: string[] = [];
  const seen = new Set<string>();
  $("#plugin-details .dg_files a[href$='.pdf'], #plugin-details .dg_files a[href*='.pdf'], .dg_files a[href*='.pdf']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const abs = toAbsolute(href, base);
      if (!seen.has(abs)) {
        seen.add(abs);
        pdfUrls.push(abs);
      }
    }
  });
  if (pdfUrls.length === 0) {
    $("a[href$='.pdf'], a[href*='.pdf']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const abs = toAbsolute(href, base);
        if (!seen.has(abs)) {
          seen.add(abs);
          pdfUrls.push(abs);
        }
      }
    });
  }

  let locationRaw: string | null = null;
  // Zara/OsClass: #location .loc-text .elem or .body e.g. "Romania, Salaj, Criseni"
  const locSelectors = ["#location .loc-text .elem", "#location .loc-text", "#location .body .elem", "#location .body"];
  for (const sel of locSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const t = trimText(el.text());
      if (t && t.length > 3 && t.length < 200 && /Romania|Judet|Ora[sș]/i.test(t)) {
        locationRaw = t;
        break;
      }
    }
  }
  if (!locationRaw) {
    const country = $('input[name="country"]').attr("value");
    const region = $('input[name="region"]').attr("value");
    const city = $('input[name="city"]').attr("value");
    if (country || region || city) {
      locationRaw = [country, region, city].filter(Boolean).join(", ");
    }
  }
  if (!locationRaw) {
    $("table tr").each((_, tr) => {
      const th = trimText($(tr).find("th").first().text());
      if (/Locat|Judet|Județ|Oras|Oraș|City|County/i.test(th)) {
        const val = trimText($(tr).find("td").first().text());
        if (val && val.length < 200) locationRaw = val;
        return false;
      }
    });
  }
  if (!locationRaw) {
    $("td, dd, div, span, th").each((_, el) => {
      const $el = $(el);
      const text = trimText($el.text());
      if (/^(Locație|Locatie|Location|Judet|Județ|Oras|Oraș)\s*:?\s*/i.test(text)) {
        const val = trimText(text.replace(/^(Locație|Locatie|Location|Judet|Județ|Oras|Oraș)\s*:?\s*/i, ""));
        if (val && val.length < 200) locationRaw = val;
        if (!locationRaw && $el.next().length) {
          const v = trimText($el.next().text());
          if (v && v.length < 200) locationRaw = v;
        }
        return false;
      }
    });
  }
  if (!locationRaw) {
    const bodyText = $("body").text();
    const locMatch = bodyText.match(/([^\n]+)\s+in\s+([^\n(]+)\s+\(Romania\)/);
    if (locMatch) locationRaw = `${trimText(locMatch[1])} in ${trimText(locMatch[2])} (Romania)`;
  }
  if (!locationRaw) {
    const locEl = $(".location, .locatie, .loc, [class*='location'], [class*='locatie']").first();
    if (locEl.length) locationRaw = trimText(locEl.text()) || null;
  }

  // Completare neapărat din descriere când lipsesc data și ora licitației (pentru evaluare și afișare)
  if (descriptionHtml) {
    const descText = descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const datePattern = /(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/g;
    const timePattern = /\b(\d{1,2})[.:](\d{2})(?::(\d{2}))?\b/g;

    if (!customFields.dataLicitatie) {
      // Preferăm data în context: "data licitație", "dată expirare", "până la", "în data de", "termene", "ziua de"
      const contextDateRegex =
        /(?:data\s*(?:licita[tț]ie|expirare)?|dat[aă]\s*expirare|expirare|termene?\s*(?:până\s*la)?|pân[aă]\s*la\s*(?:data)?|în\s*data\s*de|ziua\s*de)\s*[:\-]?\s*(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/i;
      const contextMatch = descText.match(contextDateRegex);
      if (contextMatch) {
        customFields.dataLicitatie = `${contextMatch[1].padStart(2, "0")}/${contextMatch[2].padStart(2, "0")}/${contextMatch[3]}`;
      } else {
        let best: { d: string; m: string; y: string } | null = null;
        let match: RegExpExecArray | null;
        datePattern.lastIndex = 0;
        while ((match = datePattern.exec(descText)) !== null) {
          const d = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          if (y >= 2020 && y <= 2035 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            best = { d: match[1].padStart(2, "0"), m: match[2].padStart(2, "0"), y: match[3] };
            break;
          }
        }
        if (best) customFields.dataLicitatie = `${best.d}/${best.m}/${best.y}`;
      }
    }

    if (!customFields.oraLicitatie) {
      const contextTimeRegex =
        /(?:ora\s*(?:licita[tț]ie)?|orele|la\s*ora|începe\s*la|deschidere\s*la)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})(?::(\d{2}))?/i;
      const contextTimeMatch = descText.match(contextTimeRegex);
      if (contextTimeMatch) {
        customFields.oraLicitatie = `${contextTimeMatch[1].padStart(2, "0")}:${contextTimeMatch[2]}`;
      } else {
        timePattern.lastIndex = 0;
        const timeMatch = timePattern.exec(descText);
        if (timeMatch) customFields.oraLicitatie = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
      }
    }

    if (!sellerAddress || !locationRaw) {
      const addrMatch = descText.match(/(?:adresa|sediul|locul|localitatea)\s*[:\-]\s*([^.,\n]{10,200})/i)
        || descText.match(/(Romania\s*,\s*[^.,\n]{5,150})/i);
      if (addrMatch) {
        const addr = trimText(addrMatch[1]);
        if (addr.length >= 10) {
          if (!sellerAddress) sellerAddress = addr;
          if (!locationRaw) locationRaw = addr;
        }
      }
    }

    // Dacă avem data dar e mai veche decât ziua publicării → obligatoriu din descriere (data licitației e esențială)
    if (customFields.dataLicitatie?.trim() && publishedAt) {
      const parsedStored = parseRoDate(customFields.dataLicitatie);
      const pubDay = new Date(publishedAt);
      pubDay.setHours(0, 0, 0, 0);
      if (parsedStored && parsedStored.getTime() < pubDay.getTime()) {
        const extracted = extractAuctionDateAndTimeFromText(descriptionHtml);
        if (extracted.dateIso) {
          const [y, m, d] = extracted.dateIso.slice(0, 10).split("-");
          customFields.dataLicitatie = `${d}/${m}/${y}`;
          customFields["Data licitatie 2"] = customFields.dataLicitatie;
          customFields.dataLicitatie2 = customFields.dataLicitatie;
          if (extracted.time) {
            customFields.oraLicitatie = extracted.time;
            customFields["Ora licitatie 2"] = extracted.time;
            customFields.oraLicitatie2 = extracted.time;
          }
          if (extracted.address && !sellerAddress) sellerAddress = extracted.address;
          if (extracted.address && !locationRaw) locationRaw = extracted.address;
        }
      }
    }
  }

  // Terenuri: infer din descriere Tip teren, Categoria de folosință, Suprafață
  const isTeren =
    /\bterenuri?\b|teren\s+(cu\s+)?cladire|terenuri\s+intravilane/i.test(category || "") ||
    /\bteren\b/i.test(title || "");
  if (isTeren && descriptionHtml) {
    const descText = descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hasTipTeren = Object.keys(customFields).some((k) => /tip\s*teren|intravilan|extravilan/i.test(k));
    if (!hasTipTeren) {
      const hasIntravilan = /\bintravilan[aă]?\b/i.test(descText);
      const hasExtravilan = /\bextravilan[aă]?\b/i.test(descText);
      if (hasIntravilan || hasExtravilan) {
        const parts: string[] = [];
        if (hasIntravilan) parts.push("intravilan");
        if (hasExtravilan) parts.push("extravilan");
        customFields["Tip teren"] = parts.join(", ");
      }
    }
    if (!customFields["Categoria de folosință"]) {
      const catFol = descText.match(/categoria\s+de\s+folosin[tț][aă]\s*[:\-]?\s*([^.,;]+?)(?=\s+cu\s+suprafa|\s+situat|$)/i)
        || descText.match(/folosin[tț][aă]\s+([^.,;]+?)(?=\s+cu\s+suprafa|\s+situat|$)/i);
      if (catFol) {
        const val = trimText(catFol[1]);
        if (val.length > 0 && val.length < 120) customFields["Categoria de folosință"] = val;
      }
    }
    if (!customFields["Suprafață"]) {
      const sup = descText.match(/suprafa[tț][aă]\s+de\s*([\d.\s]+)\s*mp/i);
      if (sup) {
        const val = trimText(sup[1]).replace(/\s+/g, " ") + " mp";
        if (val.length < 30) customFields["Suprafață"] = val;
      }
    }
  }

  // Imobiliare: fallback suprafață din titlu/descriere dacă lipsește din custom fields
  const isImobiliare =
    /\/imobiliare\//i.test(pageUrl) ||
    /^(Apartamente\s*si\s*case|Cladiri|Terenuri|Teren\s+cu\s+cladire|Proiecte\s*imobiliare|Proprietati\s*industriale|Spatii\s*de\s*birouri|Spatii\s*comerciale|Pensiuni|Hoteluri)$/i.test(category || "");
  if (isImobiliare) {
    const text = ((descriptionHtml || "") + " " + (title || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hasSuprafata = Object.keys(customFields).some((k) => /suprafa[tț]/i.test(k));
    if (!hasSuprafata) {
      const supMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mp/i) || text.match(/suprafa[tț][aă]\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
      if (supMatch) customFields["Suprafata"] = supMatch[1].replace(",", ".") + " mp";
    }
  }

  // Auto (Autoturisme, Camioane, Vehicule Utilitare, Vehicule Transport Persoane): fallback din descriere/titlu
  const isAuto =
    /^(Autoturisme|Camioane|Vehicule\s+Utilitare|Vehicule\s+Transport\s+Persoane)$/i.test(category || "") ||
    /\/auto\//i.test(pageUrl);
  if (isAuto) {
    const text = ((descriptionHtml || "") + " " + (title || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!customFields["KM"]) {
      const kmMatch = text.match(/(\d{1,3}(?:[.,]\d{3})*)\s*km/i) || text.match(/\b(\d{5,})\s*km/i);
      if (kmMatch) customFields["KM"] = kmMatch[1].replace(/\s/g, "").replace(",", ".");
    }
    if (!customFields["Combustibil"]) {
      const combMatch = text.match(/\b(benzina|motorina|diesel|hibrid|electric|gpl|gaz)\b/i);
      if (combMatch) customFields["Combustibil"] = combMatch[1];
    }
    if (!customFields["An fabricatie"]) {
      const anMatch = text.match(/\b(20\d{2}|19\d{2})\b/);
      if (anMatch) customFields["An fabricatie"] = anMatch[1];
    }
    if (!customFields["Marca"]) {
      const brandMatch = title?.match(/\b(Ford|Dacia|Volkswagen|VW|BMW|Mercedes|Audi|Renault|Peugeot|Citroen|Opel|Skoda|Toyota|Hyundai|Kia|Nissan|Honda|Mazda|Volvo|Fiat|Iveco|Scania|MAN|DAF)\b/i);
      if (brandMatch) customFields["Marca"] = brandMatch[1];
    }
    if (!customFields["Capacitate cilindrica"]) {
      const capMatch = text.match(/\b(\d{3,4})\s*(?:cm3|cc|cilindrica?)\b/i) || text.match(/\bcapacitate\s*[:\s]*(\d{3,4})\b/i);
      if (capMatch) customFields["Capacitate cilindrica"] = capMatch[1];
    }
  }

  // Elimină din descriere orice conținut legat de QR (imagini, linkuri, blocuri)
  if (descriptionHtml) {
    let cleaned = descriptionHtml;
    cleaned = cleaned.replace(/<img[^>]*\b(src|alt)=["'][^"']*qr[^"']*["'][^>]*>/gi, "");
    cleaned = cleaned.replace(/<img[^>]*qr[^>]*>/gi, "");
    cleaned = cleaned.replace(/<a[^>]*\bhref=["'][^"']*qr[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
    cleaned = cleaned.replace(/<[^>]*\b(class|id)=["'][^"']*qr[^"']*["'][^>]*>[\s\S]*?<\/\w+>/gi, "");
    descriptionHtml = cleaned.trim() || null;
  }

  return {
    externalId,
    title,
    priceText,
    category,
    locationRaw,
    publishedAt,
    customFields,
    sellerName,
    sellerProfileUrl,
    sellerEmail,
    sellerPhone,
    sellerAddress,
    descriptionHtml,
    imageUrls,
    pdfUrls,
  };
}

