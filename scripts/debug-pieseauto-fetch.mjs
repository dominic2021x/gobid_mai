/**
 * Script de debug: afișează unde se blochează fetch-ul pieseauto (homepage + 4 încercări produs).
 * Rulare: node scripts/debug-pieseauto-fetch.mjs
 */

const PIESEAUTO_HOMEPAGE = "https://www.pieseauto.ro/";
const PRODUCT_URL = "https://www.pieseauto.ro/pompa-apa/pompa-recirculare-apa-mercedes-cod-a0005002686-517329561.html";

const PIESEAUTO_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

const BASE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: PIESEAUTO_HOMEPAGE,
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function isCaptcha(html) {
  const lower = html.toLowerCase();
  return (
    /codul de securitate|cod nou\s*continuă/i.test(html) ||
    /te rugăm să introduci codul/i.test(html) ||
    /scuze\.\.\./i.test(html) ||
    /activitate neobișnuită|automatizată de la ip/i.test(html) ||
    /please (enable|turn on) javascript/i.test(lower) ||
    /te rugăm să activezi javascript/i.test(html)
  );
}

function getCookie(res) {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  return setCookie.split(";")[0].trim();
}

async function main() {
  console.log("1) Homepage", PIESEAUTO_HOMEPAGE);
  const homeRes = await fetch(PIESEAUTO_HOMEPAGE, {
    method: "GET",
    headers: { "User-Agent": PIESEAUTO_USER_AGENTS[0], ...BASE_HEADERS },
    redirect: "follow",
  });
  const homeHtml = await homeRes.text();
  const cookie = getCookie(homeRes);
  const homeCaptcha = isCaptcha(homeHtml);
  console.log("   status:", homeRes.status, "| captcha:", homeCaptcha, "| cookie:", cookie ? cookie.slice(0, 50) + "..." : "none");
  if (homeCaptcha) console.log("   snippet:", homeHtml.slice(0, 200).replace(/\s+/g, " "));

  await new Promise((r) => setTimeout(r, 400));

  for (let i = 0; i < PIESEAUTO_USER_AGENTS.length; i++) {
    console.log("\n2." + (i + 1) + ") Produs (UA " + (i + 1) + ")");
    const res = await fetch(PRODUCT_URL, {
      method: "GET",
      headers: {
        "User-Agent": PIESEAUTO_USER_AGENTS[i],
        ...BASE_HEADERS,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      redirect: "follow",
    });
    const html = await res.text();
    const captcha = isCaptcha(html);
    console.log("   status:", res.status, "| captcha:", captcha);
    console.log("   snippet:", html.slice(0, 180).replace(/\s+/g, " "));
    if (!captcha) {
      console.log("\n   -> OK: pagină produs primită.");
      process.exit(0);
    }
    if (i < PIESEAUTO_USER_AGENTS.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("\n-> Blocaj: toate cele 4 încercări au returnat captcha.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
