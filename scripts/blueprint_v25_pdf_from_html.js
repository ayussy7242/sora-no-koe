"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("/Applications/MAMP/htdocs/sora-no-koe/src/engine/pdf/blueprint_v25/wireframe");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

(async () => {
  const lineUserId = getArg("line_user_id") || process.env.LINE_USER_ID;
  const base =
    getArg("base") ||
    process.env.BLUEPRINT_OUT_BASE ||
    (lineUserId ? `/Applications/MAMP/htdocs/sora-no-koe/tmp/blueprint_v25_real_${lineUserId}` : null);
  const htmlPath = getArg("html") || (base ? `${base}.html` : null);
  const outPdf = getArg("out_pdf") || (base ? `${base}.pdf` : null);

  if (!htmlPath || !outPdf) {
    console.error("Missing html path. Use --html=... or --base=... (--line_user_id).");
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  fs.mkdirSync(path.dirname(outPdf), { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 300000,
    args: ["--no-sandbox", "--font-render-hinting=medium"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(240000);
    page.setDefaultNavigationTimeout(240000);
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.emulateMediaType("screen");
    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 300000,
    });
    fs.writeFileSync(outPdf, pdfBuffer);
    console.log("ok: true");
    console.log("pdf:", outPdf);
  } finally {
    await browser.close();
  }
})();

