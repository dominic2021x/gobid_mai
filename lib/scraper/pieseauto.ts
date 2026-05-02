/**
 * Parser pentru pagini de produs pieseauto.ro
 * Extrage: titlu, preț, poze, descriere, specificații, Livrare și Plată.
 */

import * as cheerio from "cheerio";

export interface PieseAutoProduct {
  title: string;
  price: number | null;
  currency: string;
  imageUrls: string[];
  description: string;
  specifications: Record<string, string>;
  livrareSiPlata: string;
  url: string;
  externalId: string | null;
  location: string;
}

function trimText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupPieseAutoSeoDescription(title: string, description: string): string {
  let out = trimText(description);
  if (!out) return out;
  const safeTitle = trimText(title);

  // Elimină sufixul SEO generic: "... de vanzare din categoria ...".
  out = out.replace(/\s+de\s+vanzare\s+din\s+categoria[\s\S]*$/i, "").trim();

  if (safeTitle) {
    const titleRe = new RegExp(`^${escapeRegex(safeTitle)}[\\s,.:-]*`, "i");
    const afterLeadingTitle = out.replace(titleRe, "").trim();

    // Dacă după primul title textul începe din nou cu același title, păstrăm doar partea unică.
    if (afterLeadingTitle) {
      const secondLeadingTitle = new RegExp(`^${escapeRegex(safeTitle)}\\b[\\s,.:-]*`, "i");
      out = afterLeadingTitle.replace(secondLeadingTitle, "").trim() || afterLeadingTitle;
    } else {
      out = afterLeadingTitle;
    }

  }

  return out || trimText(description);
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

/**
 * Rezultatul parsării paginii de captcha pieseauto (form action, câmpuri, URL imagine captcha).
 */
export interface PieseAutoCaptchaForm {
  formAction: string;
  formMethod: string;
  hiddenFields: Record<string, string>;
  captchaImageUrl: string | null;
  captchaInputName: string | null;
}

/**
 * Parsează HTML-ul paginii de captcha pentru a extrage URL-ul formularului, câmpurile hidden și imaginea captcha.
 * Adaptat pentru pieseauto.ro: "Cod nou", "Continuă", "codul de securitate".
 */
export function parseCaptchaPage(html: string, pageUrl: string): PieseAutoCaptchaForm | null {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;
  const hasPieseAutoCaptchaText =
    /codul de securitate|te rugăm să introduci codul|cod nou\s*continuă|continuă/i.test(html);

  // 0) Pagină tip pieseauto: "Cod nou" + "Continuă" – form poate fi orice form cu input text (action poate fi goală sau aceeași pagină)
  if (hasPieseAutoCaptchaText) {
    const formsWithTextInput = $("form").filter((_, el) => $(el).find('input[type="text"]').length > 0);
    if (formsWithTextInput.length > 0) {
      const first = formsWithTextInput.first();
      const action = first.attr("action");
      const actionUrl = action
        ? (action.startsWith("http") ? action : new URL(action, base).href)
        : pageUrl;
      const method = (first.attr("method") || "post").toLowerCase();
      const hidden: Record<string, string> = {};
      first.find('input[type="hidden"]').each((_, el) => {
        const n = $(el).attr("name");
        const v = $(el).attr("value");
        if (n) hidden[n] = v ?? "";
      });
      let imgUrl: string | null = null;
      const getImgUrl = (src: string | undefined): string | null => {
        if (!src || /logo|icon|favicon|pixel/i.test(src)) return null;
        return src.startsWith("http") ? src : new URL(src, base).href;
      };
      first.find("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
        const u = getImgUrl(src);
        if (u) imgUrl = u;
        return false;
      });
      if (!imgUrl) {
        first.parent().find("img").each((_, el) => {
          if (imgUrl) return false;
          const src = $(el).attr("src") || $(el).attr("data-src");
          const u = getImgUrl(src);
          if (u) imgUrl = u;
          return false;
        });
      }
      if (!imgUrl) {
        $("img").each((_, el) => {
          if (imgUrl) return false;
          const src = $(el).attr("src") || $(el).attr("data-src");
          if (src && !/logo|icon|favicon|pixel|avatar|facebook|twitter|google/i.test(src))
            imgUrl = src.startsWith("http") ? src : new URL(src, base).href;
          return false;
        });
      }
      // Container tip captcha/sec/cod – prima img din el
      if (!imgUrl) {
        $("[class*='captcha'], [id*='captcha'], [class*='sec'], [id*='sec'], [class*='cod'], [id*='cod']").each((_, el) => {
          if (imgUrl) return false;
          const $c = $(el);
          if ($c.is("img")) {
            const src = $c.attr("src") || $c.attr("data-src");
            const u = getImgUrl(src);
            if (u) imgUrl = u;
          } else {
            const img = $c.find("img").first();
            if (img.length) {
              const src = img.attr("src") || img.attr("data-src");
              const u = getImgUrl(src);
              if (u) imgUrl = u;
            }
          }
          return false;
        });
      }
      // Prioritate: img cu URL tip captcha (captcha.php, sec, image.php, etc.)
      if (imgUrl && !/captcha|sec|image\.php|verify|check|\.php\?/i.test(imgUrl)) {
        const betterImg = $("img[src*='captcha'], img[src*='sec'], img[src*='.php'], img[data-src*='captcha'], img[data-src*='.php']").first();
        if (betterImg.length) {
          const src = betterImg.attr("src") || betterImg.attr("data-src");
          if (src) imgUrl = src.startsWith("http") ? src : new URL(src, base).href;
        }
      }
      // Fallback: URL captcha în HTML (href, src, sau în script) – pattern pentru pieseauto.ro
      if (!imgUrl && base.includes("pieseauto")) {
        const urlMatch = html.match(/(?:src|href|=)\s*["']([^"']*(?:captcha|sec|verify|image\.php|cod)[^"']*)["']/i)
          || html.match(/(https?:\/\/[^\s"']+\.(?:php|png|jpg|gif)(?:\?[^\s"']*)?)/i);
        if (urlMatch && urlMatch[1]) {
          const raw = urlMatch[1].trim();
          if (!/logo|icon|favicon|facebook|twitter/i.test(raw))
            imgUrl = raw.startsWith("http") ? raw : new URL(raw, base).href;
        }
      }
      const textInputName =
        first.find('input[type="text"]').first().attr("name") ||
        first.find("input[name*='cod'], input[name*='code'], input[name*='captcha'], input[id*='captcha']").first().attr("name") ||
        "code";
      if (imgUrl) {
        return {
          formAction: actionUrl,
          formMethod: method,
          hiddenFields: hidden,
          captchaImageUrl: imgUrl,
          captchaInputName: textInputName,
        };
      }
    }
  }

  // 1) Form cu text "cod/securitate/captcha" sau img cu src/id/class captcha
  let formEl = $("form").filter((_, el) => {
    const action = $(el).attr("action");
    const text = $(el).text() + " " + ($(el).find("input").attr("name") || "");
    return !!(
      action &&
      (/cod|securitate|captcha|continuă/i.test(text) ||
        $(el).find('img[src*="captcha"], img[src*="sec"], img[id*="captcha"], img[class*="captcha"]').length > 0)
    );
  }).first();

  if (!formEl.length) {
    formEl = $("form").has('img[src*="captcha"], img[src*=".php"], img[src*="sec"]').first();
  }
  // 2) Orice form care are atât img cât și input text (tipic pentru captcha)
  if (!formEl.length) {
    formEl = $("form").filter((_, el) => {
      const action = $(el).attr("action");
      const hasImg = $(el).find("img").length > 0;
      const hasTextInput = $(el).find('input[type="text"]').length > 0;
      return !!(action && hasImg && hasTextInput);
    }).first();
  }
  // 3) Form cu action care sugerează captcha/verificare + orice img pe pagină
  if (!formEl.length && /cod|securitate|captcha|continuă/i.test(html)) {
    const forms = $("form").filter((_, el) => {
      const action = ($(el).attr("action") || "").toLowerCase();
      return !!(action && (action.includes("captcha") || action.includes("sec") || action.includes("verify") || action.includes("check")));
    });
    if (forms.length) formEl = forms.first();
  }
  if (!formEl.length) return null;
  const formAction = formEl.attr("action");
  if (!formAction) return null;

  const formMethod = (formEl.attr("method") || "get").toLowerCase();
  const actionUrl = formAction.startsWith("http") ? formAction : new URL(formAction, base).href;

  const hiddenFields: Record<string, string> = {};
  formEl.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name");
    const val = $(el).attr("value");
    if (name) hiddenFields[name] = val ?? "";
  });

  let captchaImageUrl: string | null = null;
  const captchaImg = formEl.find('img[src*="captcha"], img[src*="sec"], img[id*="captcha"], img[class*="captcha"], img[src*=".php"]').first();
  if (captchaImg.length) {
    const src = captchaImg.attr("src");
    if (src) captchaImageUrl = src.startsWith("http") ? src : new URL(src, base).href;
  }
  if (!captchaImageUrl) {
    const anyImg = formEl.find("img").first();
    if (anyImg.length) {
      const src = anyImg.attr("src");
      if (src) captchaImageUrl = src.startsWith("http") ? src : new URL(src, base).href;
    }
  }
  // Imagine captcha poate fi și în afara formularului (în același div)
  if (!captchaImageUrl) {
    $("img").each((_, el) => {
      if (captchaImageUrl) return;
      const src = $(el).attr("src");
      if (!src || /logo|icon|favicon|pixel|avatar|facebook|twitter|google/i.test(src)) return;
      captchaImageUrl = src.startsWith("http") ? src : new URL(src, base).href;
    });
  }
  // Exclude imagini care sunt sigur nu captcha (logo, iconițe) – înlocuie cu altă img din form
  if (captchaImageUrl && /logo|icon|favicon|pixel/i.test(captchaImageUrl)) {
    const otherImg = formEl.find("img").filter((_, el) => {
      const s = $(el).attr("src") || "";
      return !/logo|icon|favicon|pixel/i.test(s);
    }).first();
    if (otherImg.length) {
      const src = otherImg.attr("src");
      if (src) captchaImageUrl = src.startsWith("http") ? src : new URL(src, base).href;
    }
  }

  let captchaInputName: string | null = null;
  const textInput = formEl.find('input[type="text"]').first();
  if (textInput.length) captchaInputName = textInput.attr("name") ?? null;
  if (!captchaInputName) {
    const byName = formEl.find('input[name*="captcha"], input[name*="code"], input[name*="cod"], input[id*="captcha"]').first();
    if (byName.length) captchaInputName = byName.attr("name") ?? null;
  }

  return {
    formAction: actionUrl,
    formMethod,
    hiddenFields,
    captchaImageUrl,
    captchaInputName,
  };
}

/**
 * Verifică dacă HTML-ul este pagina de captcha/securitate (nu și doar bannerul de cookie-uri).
 * Pagina de aprobare cookie-uri (fără "codul de securitate" / "activitate neobișnuită") nu e blocaj.
 */
export function isCaptchaOrBlockPage(html: string): boolean {
  const lower = html.toLowerCase();
  const hasSecurityCode =
    /codul de securitate|cod nou\s*continuă/i.test(html) || /te rugăm să introduci codul/i.test(html);
  const hasAntiBot =
    /activitate neobișnuită|automatizată de la ip/i.test(html) ||
    /pagina anti-bot/i.test(lower) ||
    /please (enable|turn on) javascript/i.test(lower) ||
    /te rugăm să activezi javascript/i.test(html);

  if (hasAntiBot || hasSecurityCode) return true;

  // Doar consimțământ cookie (fără cod securitate / anti-bot): nu e blocaj, încearcă parsarea
  if (/cookie|accepți|consimțământ|politica de cookie/i.test(html)) return false;

  return /scuze\.\.\./i.test(html);
}

/**
 * Parsează o pagină de produs pieseauto.ro.
 * Folosește selectori generici pentru produs (og:image, meta, galerii, blocuri descriere/specs/livrare).
 */
export function parsePieseAutoProductPage(html: string, pageUrl: string): PieseAutoProduct {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;

  const result: PieseAutoProduct = {
    title: "",
    price: null,
    currency: "RON",
    imageUrls: [],
    description: "",
    specifications: {},
    livrareSiPlata: "",
    url: pageUrl,
    externalId: null,
    location: "",
  };

  // ID din URL (ex: ...-51777357.html)
  const idMatch = pageUrl.match(/-(\d+)\.html/);
  if (idMatch) result.externalId = idMatch[1];

  // Titlu: og:title, h1, .product-title, etc.
  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle) result.title = trimText(ogTitle);
  if (!result.title) {
    const h1 = $("h1").first().text();
    if (h1) result.title = trimText(h1);
  }
  if (!result.title) {
    const sel = $(".product-title, .product-name, .product__title, [class*='product-title'], [class*='product-name']").first();
    if (sel.length) result.title = trimText(sel.text());
  }
  if (!result.title) result.title = "Produs piese auto";
  // ID din titlu (ex: "… ID #1805726367") – folosit doar pentru deduplicare, nu se afișează
  const idFromTitle = result.title.match(/\bID\s*#(\d+)\s*$/i) ?? result.title.match(/\s#(\d+)\s*$/);
  if (idFromTitle && !result.externalId) result.externalId = idFromTitle[1];
  result.title = trimText(result.title.replace(/\s*ID\s*#\d+\s*$/i, "").replace(/\s*#\d+\s*$/i, ""));

  // Locație: sub titlu (pin + oraș, ex. București) – pieseauto
  const locationSelectors = [
    "[class*='location']",
    "[class*='locat']",
    "[class*='city']",
    "[class*='oras']",
    ".pr-head [class*='loc']",
    "[class*='product-location']",
    "[class*='seller-location']",
  ];
  for (const sel of locationSelectors) {
    const $loc = $(sel).first();
    if ($loc.length) {
      const raw = trimText($loc.text());
      const withoutId = raw.replace(/\s*ID\s*#\d+\s*$/i, "").trim();
      if (withoutId.length > 0 && withoutId.length < 120 && !/^\d+$/.test(withoutId)) {
        result.location = withoutId;
        break;
      }
    }
  }
  if (!result.location && base.includes("pieseauto")) {
    const $header = $(".pr-head, [class*='product-head'], .product-header").first();
    if ($header.length) {
      const headerText = $header.text();
      const locMatch = headerText.match(/(?:loca[tț]ie|ora[sș]|ora[sș]\/jud)[:\s]*([^\n\d#]+?)(?:\s*ID\s*#|$)/i)
        ?? headerText.match(/([A-Za-zăâîșțĂÂÎȘȚ\-]+\s*,\s*)?[A-Za-zăâîșțĂÂÎȘȚ\-]{2,}(?:\s+[\d#]|$)/);
      if (locMatch) result.location = trimText(locMatch[1] || locMatch[0]).replace(/\s*ID\s*#\d+.*$/i, "").trim();
    }
  }

  // Preț: .price/.pret (ignorăm dacă conțin doar CSS, ex. spinner), [data-price], apoi text „X lei”/„X Lei” în pagină
  const priceSel = $(".price, .pret, .product-price, [class*='price']").first();
  let priceText = priceSel.length ? trimText(priceSel.text()) : "";
  const looksLikeCss = /transform|animation|keyframes|@keyframes|step-end|deg\)|spinner|\.spinner_/i.test(priceText);
  if (looksLikeCss || (priceText.length > 0 && !/\d{1,6}([.,]\d+)?\s*(lei|ron|eur)/i.test(priceText))) priceText = "";
  let priceMatch = priceText ? priceText.match(/(\d+(?:[.,]\d+)*)\s*(RON|EUR|lei)?/i) : null;
  if (!priceMatch) {
    const bodyText = $("body").text();
    priceMatch = bodyText.match(/(\d+(?:[.,]\d+)*)\s*(RON|EUR|lei)/i) ?? bodyText.match(/pre[tț]\s*[:\s]*(\d+(?:[.,]\d+)*)/i);
  }
  if (!priceMatch && $("[class*='product-info'], [class*='product-detail'], main, article").length) {
    const productBlock = $("[class*='product-info'], [class*='product-detail'], main, article").first().text();
    priceMatch = productBlock.match(/(\d+(?:[.,]\d+)*)\s*(RON|EUR|lei)/i);
  }
  if (priceMatch) {
    const num = parseFloat(priceMatch[1].replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(num) && num > 0 && num < 10000000) result.price = num;
    if (priceMatch[2] && /eur/i.test(priceMatch[2])) result.currency = "EUR";
  }
  const dataPrice = $("[data-price]").attr("data-price");
  if (result.price == null && dataPrice) {
    const n = parseFloat(dataPrice);
    if (!Number.isNaN(n)) result.price = n;
  }

  // Poze: doar din galeria produsului; deduplicare după path (fără ?query); pe pieseauto același poză are mai multe dimensiuni (-500-0-1-85-1.jpg vs -0-0-0-0-0.jpg) – folosim o cheie de bază ca să count ca 1
  const MAX_PRODUCT_IMAGES = 12;
  const seenPaths = new Set<string>();
  const addImage = (url: string) => {
    if (result.imageUrls.length >= MAX_PRODUCT_IMAGES) return;
    const abs = toAbsolute(url, base);
    if (!abs || /logo|icon|favicon|pixel|avatar|spinner/i.test(abs)) return;
    try {
      const path = new URL(abs).pathname;
      // Pe pieseauto: același poză apare cu sufix de dimensiune (-500-0-1-85-1.jpg și -0-0-0-0-0.jpg) – deduplicăm după „bază” (fără acel sufix)
      let dedupeKey = path;
      if (base.includes("pieseauto") && /\/poze\//.test(path)) {
        const baseKey = path.replace(/\-\d+\-\d+\-\d+\-\d+\-\d+\.(jpe?g|png|webp)$/i, ".$1");
        if (baseKey !== path) dedupeKey = baseKey;
      }
      if (seenPaths.has(dedupeKey)) return;
      seenPaths.add(dedupeKey);
      // Preferăm URL-ul „full size” (-0-0-0-0-0) dacă îl găsim mai târziu; păstrăm primul adăugat (nu înlocuim)
      result.imageUrls.push(abs);
    } catch {
      if (!result.imageUrls.includes(abs)) result.imageUrls.push(abs);
    }
  };

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) addImage(ogImage);

  // Pieseauto: galeria reală – .pr-head__gallery / .pr-gallery; și toate URL-uri /poze/ din HTML (slide-urile lazy au URL în atribute)
  if (base.includes("pieseauto")) {
    const $pieseGallery = $(".pr-head__gallery, .pr-gallery").first();
    if ($pieseGallery.length) {
      $pieseGallery.find("img[src*='/poze/'], img[data-src*='/poze/']").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src");
        if (src) addImage(src);
      });
      $pieseGallery.find("picture source[srcset]").each((_, el) => {
        const srcset = $(el).attr("srcset");
        if (srcset) {
          const firstUrl = srcset.split(/\s+/)[0];
          if (firstUrl && firstUrl.includes("/poze/")) addImage(firstUrl.trim());
        }
      });
      // Toate URL-urile /poze/ din HTML-ul galeriei (img lazy, data-src, srcset, etc.)
      const galleryHtml = $pieseGallery.html() || "";
      const pozeUrlRe = /https?:\/\/[^"'\s]*\/poze\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
      let m: RegExpExecArray | null;
      while ((m = pozeUrlRe.exec(galleryHtml)) !== null) addImage(m[0]);
    }
  }

  // Pieseauto fallback: containerul care conține h1 și are cel mai mic nr de img /poze/ (dacă .pr-gallery nu a găsit)
  if (base.includes("pieseauto") && result.imageUrls.length <= 1) {
    const $firstPoze = $("img[src*='/poze/'], img[data-src*='/poze/']").first();
    if ($firstPoze.length) {
      const candidates = $firstPoze.parents().filter((_, el) => {
        const $el = $(el);
        if ($el.find("h1").length === 0) return false;
        const n = $el.find("img[src*='/poze/'], img[data-src*='/poze/']").length;
        return n >= 1 && n <= 15;
      });
      let $productBlock = $([]);
      let minCount = 999;
      candidates.each((_, el) => {
        const $el = $(el);
        const n = $el.find("img[src*='/poze/'], img[data-src*='/poze/']").length;
        if (n < minCount) {
          minCount = n;
          $productBlock = $el;
        }
      });
      if ($productBlock.length) {
        $productBlock.find("img[src*='/poze/'], img[data-src*='/poze/']").each((_, el) => {
          const src = $(el).attr("src") || $(el).attr("data-src");
          if (src) addImage(src);
        });
        $productBlock.find("a[href*='/poze/']").each((_, el) => {
          const href = $(el).attr("href");
          if (href) addImage(href);
        });
      }
    }
  }

  // Container galerie clasic și fallback-uri doar dacă NU suntem pe pieseauto (acolo folosim doar .pr-head__gallery / .pr-gallery ca să nu luăm poze în plus)
  if (!base.includes("pieseauto") && result.imageUrls.length <= 1) {
    const galleryContainerSel = ".product-gallery, .product-images, .gallery, [class*='product-gallery'], [class*='product-images'], .thumbnails, .slides";
    const $gallery = $(galleryContainerSel).first();
    if ($gallery.length) {
      $gallery.find("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
        if (src) addImage(src);
      });
      $gallery.find("a[href*='/poze/'], a[data-fancybox], a[rel='image_group']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) addImage(href);
      });
    }
  }

  if (!base.includes("pieseauto") && result.imageUrls.length <= 1) {
    $(".product-main img, .main-image img, #product-image img").first().parent().find("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src) addImage(src);
    });
  }
  if (result.imageUrls.length <= 1 && base.includes("pieseauto")) {
    const $firstPoze = $("img[src*='/poze/'], img[data-src*='/poze/']").first();
    if ($firstPoze.length) {
      const $container = $firstPoze.closest("div, section, figure");
      if ($container.length) $container.find("img[src*='/poze/'], img[data-src*='/poze/']").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src");
        if (src) addImage(src);
      });
    }
  }

  // Descriere: meta description, og:description, apoi blocuri .description / #descriere, apoi conținut principal
  const metaDesc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content");
  if (metaDesc) result.description = trimText(metaDesc);

  const descSelectors = [
    ".product-description",
    ".product-description .content",
    "#product-description",
    "[class*='product-description']",
    ".description",
    "#descriere",
    "[id*='descriere']",
    "[class*='descriere']",
    ".product-details",
    ".product-info .content",
    "[class*='product-info']",
    "main .content",
    "article .content",
  ];
  for (const sel of descSelectors) {
    const block = $(sel).first();
    if (block.length) {
      const text = trimText(block.text());
      const htmlContent = block.html() || "";
      if (text.length > 50 && text.length > result.description.length) {
        result.description = text;
        break;
      }
      if (htmlContent.length > 100 && !result.description) {
        result.description = text || trimText(block.text());
        break;
      }
    }
  }
  $("h2, h3").each((_, el) => {
    const $h = $(el);
    if (/descriere/i.test(trimText($h.text()))) {
      const next = $h.next();
      if (next.length && trimText(next.text()).length > 30) {
        const t = trimText(next.text());
        if (t.length > result.description.length) result.description = t;
        return false;
      }
    }
  });
  // Fallback: primul paragraf lung din main/article (ex. pieseauto fără bloc explicit descriere)
  if (result.description.length < 80 && result.title) {
    $("main p, article p, [class*='product'] p, .content p").each((_, el) => {
      const t = trimText($(el).text());
      if (t.length > 80 && t.length > result.description.length && !/cookie|confidențial|termeni/i.test(t)) {
        result.description = t;
        return false;
      }
    });
  }

  // Specificații: tabele key-value, dl/dt/dd, liste; pentru pieseauto și tab-urile .pr-tabs-wrap
  if (base.includes("pieseauto")) {
    const specsTabSelectors = [
      ".pr-tab-content[data-tab='specs']",
      "[data-tab='specs'].pr-tab-content",
      ".pr-tabs__content[data-tab='specs']",
      ".pr-tabs-wrap [data-tab='specs']",
      "[data-tab='specs']",
      ".product-specs",
      "[class*='product-specs']",
      "[class*='specificatii']",
    ];
    let $specsTab = $([]);
    for (const sel of specsTabSelectors) {
      const $candidate = $(sel).first();
      if ($candidate.length && trimText($candidate.text()).length > 20) {
        $specsTab = $candidate;
        break;
      }
    }
    if ($specsTab.length) {
      const $subs = $specsTab.find(".pr-subtitle2");
      if ($subs.length) {
        $subs.each((_, sub) => {
          const $subEl = $(sub);
          const key = trimText($subEl.text()).replace(/:+\s*$/, "");
          const parts: string[] = [];
          $subEl.nextAll().each((_, nextEl) => {
            const $next = $(nextEl);
            if ($next.hasClass("pr-subtitle2")) return false;
            const t = trimText($next.text());
            if (t) parts.push(t);
          });
          const val = parts.join(", ");
          if (key && val && val.length < 500) result.specifications[key] = val;
        });
      }
      // Rânduri tip etichetă + valoare (ex. div cu două span-uri sau dt/dd)
      $specsTab.find("tr").each((_, tr) => {
        const cells = $(tr).find("td, th");
        if (cells.length >= 2) {
          const key = trimText(cells.eq(0).text()).replace(/:+\s*$/, "");
          const val = trimText(cells.eq(1).text());
          if (key && val && val.length < 500) result.specifications[key] = val;
        }
      });
      $specsTab.find("dl").each((_, dl) => {
        const $dl = $(dl);
        $dl.find("dt").each((i, dt) => {
          const key = trimText($(dt).text()).replace(/:+\s*$/, "");
          const val = trimText($dl.find("dd").eq(i).text());
          if (key && val && val.length < 500) result.specifications[key] = val;
        });
      });
      // Liste cu "Etichetă: valoare"
      $specsTab.find("li").each((_, li) => {
        const text = trimText($(li).text());
        const colon = text.indexOf(":");
        if (colon > 0) {
          const key = text.slice(0, colon).trim().replace(/:+\s*$/, "");
          const val = text.slice(colon + 1).trim();
          if (key && val && val.length < 500) result.specifications[key] = val;
        }
      });
      const models = $specsTab.find(".q-car-model").map((_, el) => trimText($(el).text())).get().filter(Boolean);
      if (models.length > 0 && !result.specifications["Compatibil cu"] && !Object.keys(result.specifications).some((k) => /compatibil/i.test(k))) {
        result.specifications["Compatibil cu"] = models.join(", ");
      }
      if (Object.keys(result.specifications).length === 0) {
        const fullText = trimText($specsTab.text());
        if (fullText.length > 5 && fullText.length < 2000) {
          result.specifications["Specificații"] = fullText;
        }
      }
    }
    const $shippingTab = $(".pr-tab-content[data-tab='shipping'], [data-tab='shipping']").first();
    if ($shippingTab.length) {
      const shipText = trimText($shippingTab.text());
      if (shipText.length > 10 && (!result.livrareSiPlata || shipText.length > result.livrareSiPlata.length)) {
        result.livrareSiPlata = shipText;
      }
    }
  }

  // Tabele și liste de specificații (orice pagină)
  const specTable = $("table.specifications, table.specs, .specifications table, [class*='specificatii'] table, [class*='specifications'] table").first();
  if (specTable.length) {
    specTable.find("tr").each((_, tr) => {
      const cells = $(tr).find("td, th");
      if (cells.length >= 2) {
        const key = trimText(cells.eq(0).text()).replace(/:+\s*$/, "");
        const val = trimText(cells.eq(1).text());
        if (key && val && val.length < 500) result.specifications[key] = val;
      }
    });
  }
  $("dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((i, dt) => {
      const key = trimText($(dt).text()).replace(/:+\s*$/, "");
      const dd = $dl.find("dd").eq(i);
      const val = trimText(dd.text());
      if (key && val && val.length < 500) result.specifications[key] = val;
    });
  });
  $("[class*='specificatii'] li, [class*='specifications'] li, .specs li").each((_, li) => {
    const text = trimText($(li).text());
    const colon = text.indexOf(":");
    if (colon > 0) {
      const key = text.slice(0, colon).trim().replace(/:+\s*$/, "");
      const val = text.slice(colon + 1).trim();
      if (key && val && val.length < 500) result.specifications[key] = val;
    }
  });
  // Pieseauto: și din zona produs (ex. .pr-head, main) – rânduri cu două coloane sau "Label: value"
  if (base.includes("pieseauto") && Object.keys(result.specifications).length === 0) {
    const $productArea = $(".pr-head, .pr-tabs-wrap, main, [class*='product-detail'], [class*='product-info']").first();
    if ($productArea.length) {
      $productArea.find("tr").each((_, tr) => {
        const cells = $(tr).find("td, th");
        if (cells.length >= 2) {
          const key = trimText(cells.eq(0).text()).replace(/:+\s*$/, "");
          const val = trimText(cells.eq(1).text());
          if (key && val && key.length < 80 && val.length < 500) result.specifications[key] = val;
        }
      });
      const text = $productArea.text();
      const keyValRe = /([A-Za-zăâîșțĂÂÎȘȚ\s\-]+):\s*([^\n]+?)(?=\s+[A-Za-zăâîșțĂÂÎȘȚ\-]+:\s|$)/g;
      let kv: RegExpExecArray | null;
      while ((kv = keyValRe.exec(text)) !== null) {
        const key = trimText(kv[1]);
        const val = trimText(kv[2]).slice(0, 300);
        if (key.length >= 2 && key.length < 60 && val.length >= 1 && !/^(RON|lei|EUR|\d+)$/.test(val)) {
          result.specifications[key] = val;
        }
      }
    }
  }

  // Livrare și Plată: secțiuni cu aceste cuvinte
  const livrareParts: string[] = [];
  $("h2, h3, h4, .section-title, [class*='title']").each((_, el) => {
    const $el = $(el);
    const text = trimText($el.text());
    if (/livrare|plat[aă]|payment|delivery|shipping/i.test(text)) {
      const container = $el.closest("div, section, article").length ? $el.closest("div, section, article") : $el.parent();
      const body = container.length ? trimText(container.text()) : trimText($el.next().text());
      if (body && body.length > 20 && !livrareParts.includes(body)) livrareParts.push(body);
    }
  });
  $("[class*='livrare'], [class*='plata'], [class*='payment'], [class*='delivery'], [id*='livrare'], [id*='plata']").each((_, el) => {
    const t = trimText($(el).text());
    if (t.length > 30 && !livrareParts.includes(t)) livrareParts.push(t);
  });
  if (livrareParts.length > 0) result.livrareSiPlata = livrareParts.join("\n\n");

  // Scoate ID-ul din descriere (doar pentru deduplicare, nu se afișează)
  if (result.description) {
    result.description = trimText(
      result.description.replace(/\s*#\d+\s*$/g, "").replace(/\s*ID\s*#\d+\s*/gi, " ")
    );
    if (base.includes("pieseauto")) {
      result.description = cleanupPieseAutoSeoDescription(result.title, result.description);
    }
  }

  return result;
}
