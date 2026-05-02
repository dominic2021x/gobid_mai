#!/usr/bin/env node
/**
 * Deschide browser la pieseauto.ro, apasă "ACCEPT TOATE", apoi scanează pagina și afișează câmpurile extrase.
 * Rulare: node scripts/pieseauto-open-browser.mjs [URL]
 */

const url =
  process.argv[2] ||
  "https://www.pieseauto.ro/pompa-apa/pompa-recirculare-apa-mercedes-cod-a0005002686-517329561.html";

function trim(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Scanează HTML-ul și afișează câmpurile pe care le folosim la extragere. */
async function scanPageFields(html, pageUrl) {
  const cheerio = await import("cheerio");
  const load = cheerio.load || cheerio.default;
  const $ = load(html);
  const base = new URL(pageUrl).origin;

  const titleOg = $('meta[property="og:title"]').attr("content");
  const titleH1 = $("h1").first().text();
  const titleSel = $(".product-title, .product-name, .product__title, [class*='product-title']").first().text();
  const priceSel = $(".price, .pret, .product-price, [class*='price']").first().text();
  const dataPrice = $("[data-price]").attr("data-price");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const galleryImgs = [];
  $(".product-gallery img, .product-images img, .gallery img, [class*='gallery'] img, [class*='product-image'] img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && !/logo|icon/i.test(src)) galleryImgs.push(src.startsWith("http") ? src : base + (src.startsWith("/") ? src : "/" + src));
  });
  const descSel = $(".product-description, .description, #descriere, [class*='descriere']").first().text();
  const metaDesc = $('meta[name="description"]').attr("content");

  console.log("\n========== SCAN PAGINĂ (după accept cookie) ==========");
  console.log("Titlu (og:title):", trim(titleOg) || "(gol)");
  console.log("Titlu (h1):", trim(titleH1) || "(gol)");
  console.log("Titlu (.product-title):", trim(titleSel) || "(gol)");
  console.log("Preț (text .price/.pret):", trim(priceSel) || "(gol)");
  console.log("Preț (data-price):", dataPrice || "(gol)");
  console.log("Imagine (og:image):", ogImage ? ogImage.slice(0, 70) + "..." : "(gol)");
  console.log("Imagini galerie:", galleryImgs.length, galleryImgs.length ? galleryImgs[0].slice(0, 60) + "..." : "");
  console.log("Descriere (bloc):", trim(descSel).slice(0, 80) + (trim(descSel).length > 80 ? "..." : "") || "(gol)");
  console.log("Meta description:", trim(metaDesc).slice(0, 60) + "..." || "(gol)");
  console.log("========================================================\n");
}

async function main() {
  const puppeteer = await import("puppeteer");
  console.log("Se deschide browserul la:", url);
  console.log("1) Se încarcă pagina\n2) Se apasă 'ACCEPT TOATE'\n3) Se scanează câmpurile pentru extragere.\n");

  const browser = await puppeteer.default.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2500));
    // 1) Apasă butonul de cookie
    await page.evaluate(() => {
      const text = "ACCEPT TOATE";
      const candidates = document.querySelectorAll("button, a, [role='button'], input[type='submit'], .btn, [class*='accept'], [class*='cookie']");
      for (const el of candidates) {
        if (el.textContent?.toUpperCase().includes(text) || el.value?.toUpperCase?.().includes(text)) {
          el.click();
          return;
        }
      }
      for (const el of document.querySelectorAll("button, a, [role='button']")) {
        if (el.textContent?.trim().toUpperCase().includes("ACCEPT")) {
          el.click();
          return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 2000));
    // 2) După accept – ia HTML-ul și extrage (scan) câmpurile
    const html = await page.content();
    const hasCaptcha = /codul de securitate|te rugăm să introduci codul|continuă/i.test(html);
    if (hasCaptcha) {
      console.log(">>> Pagina afișează încă CAPTCHA (cod de securitate).");
    } else {
      console.log(">>> Pagina este produs (fără captcha). Se scanează câmpurile...");
      await scanPageFields(html, url);
    }
  } catch (e) {
    console.error("Eroare la navigare:", e.message);
  }

  console.log("Browserul rămâne deschis 60 secunde (închide-l manual dacă vrei mai devreme).");
  await new Promise((r) => setTimeout(r, 60000));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
