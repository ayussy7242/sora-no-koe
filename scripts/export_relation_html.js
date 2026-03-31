"use strict";

const fs = require("fs");
const path = require("path");
const { buildRelationHtmlPaginated } = require("../src/engine/pdf/relation/render");

function usage() {
  return [
    "Usage:",
    "  node scripts/export_relation_html.js <view_json_path> <out_html_path>",
    "",
    "Example:",
    "  node scripts/export_relation_html.js tmp/relation_view.json tmp/relation_preview.html",
  ].join("\n");
}

async function main() {
  const [, , viewPath, outPath] = process.argv;
  if (!viewPath || !outPath) {
    console.log(usage());
    process.exit(1);
  }
  const absView = path.resolve(viewPath);
  const absOut = path.resolve(outPath);
  const raw = fs.readFileSync(absView, "utf8");
  const view = JSON.parse(raw);
  const html = await buildRelationHtmlPaginated(view);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, html, "utf8");
  console.log(`HTML written: ${absOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
