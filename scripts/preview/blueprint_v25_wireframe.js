"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { buildBlueprintV25WireframeHtml, PAGE_WIDTH, PAGE_HEIGHT } = require("../../src/engine/pdf/blueprint_v25/wireframe");

async function run() {
  const outDir = path.join(process.cwd(), "tmp", "blueprint", "wireframes");
  fs.mkdirSync(outDir, { recursive: true });

  const args = process.argv.slice(2);
  const getArg = (key) => {
    const idx = args.indexOf(key);
    if (idx === -1) return null;
    return args[idx + 1] || null;
  };
  const dataPath = getArg("--data");
  const kernelPath = getArg("--kernel");
  const storyPath = getArg("--story");
  const name = getArg("--name");
  const outPdfArg = getArg("--out");
  const outHtmlArg = getArg("--out-html");
  const hasInput = Boolean(dataPath || kernelPath || storyPath);

  const stamp = Date.now();
  const baseName = name
    ? `blueprint_v25_${name}`
    : hasInput
      ? `blueprint_v25_output_${stamp}`
      : "blueprint_v25_wireframe";
  const outHtml = outHtmlArg
    ? path.resolve(outHtmlArg)
    : path.join(outDir, `${baseName}.html`);
  const outPdf = outPdfArg
    ? path.resolve(outPdfArg)
    : path.join(outDir, `${baseName}.pdf`);

  let data = {};
  if (dataPath && fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }
  if (kernelPath && fs.existsSync(kernelPath)) {
    data.kernel = JSON.parse(fs.readFileSync(kernelPath, "utf8"));
  }
  if (storyPath && fs.existsSync(storyPath)) {
    data.story = JSON.parse(fs.readFileSync(storyPath, "utf8"));
  }

  const useSpace = process.env.BLUEPRINT_WIREFRAME_USE_SPACE === "1";
  const html = buildBlueprintV25WireframeHtml({ data, useSpace });
  fs.writeFileSync(outHtml, html, "utf8");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=medium"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });
    await page.emulateMediaType("screen");
    await page.pdf({
      path: outPdf,
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }

  console.log(`output html: ${outHtml}`);
  console.log(`output pdf: ${outPdf}`);
}

run().catch((err) => {
  console.error("wireframe failed", err);
  process.exit(1);
});
