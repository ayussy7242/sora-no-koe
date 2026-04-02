"use strict";

const { DEEP_AXIS_ROLE_TAGLINES } = require("./constants");
const { escapeHtml, renderRichText, renderInlineText, estimateBlockHeight, paginateBlocks } = require("./utils");
const { replaceGlyphsWithImages, buildGlyphImgTag } = require("./glyphs");
const { wrapZodiacGlyphs } = require("./zodiac");

function buildPlanetPages({ p, usableHeight }) {
  const plnBlocks = (p.planetRolesAll || []).map((card) => {
    const textForHeight = [card.roleLabel, card.text].filter(Boolean).join("\n");
    const basePad = 14;
    const extraPad = card.key === "pluto" ? 20 : 0;
    const height = estimateBlockHeight({ text: textForHeight }) + basePad + extraPad;
    const roleHtml = card.roleLabel ? `<div class="card-role">${escapeHtml(card.roleLabel)}</div>` : "";
    const metaHtml = wrapZodiacGlyphs(escapeHtml(card.meta));
    const html = [
      `<div class="card">`,
      `<div class="card-title">${escapeHtml(card.label)}<span class="card-meta-inline">${metaHtml}</span></div>`,
      roleHtml,
      `<div class="card-text text-block">${renderRichText(card.text)}</div>`,
      `</div>`,
    ].join("");
    return { html, height };
  });
  let plnPages = paginateBlocks(plnBlocks, { maxHeight: usableHeight, minUsage: 0.35 });
  if (plnPages.length > 3) {
    const merged = plnPages.slice(2).reduce((acc, page) => acc.concat(page.blocks), []);
    plnPages = [
      plnPages[0],
      plnPages[1],
      { blocks: merged, height: merged.reduce((sum, b) => sum + b.height, 0) },
    ];
  }
  return plnPages;
}

function buildLayerPages({ p, usableHeight }) {
  const layBlocks = [
    { key: "core", title: "中心の層", sub: "CORE LAYER", lines: p.systemLayerLines?.core || [], text: p.planetGroups.core || "" },
    { key: "personal", title: "個の層", sub: "PERSONAL LAYER", lines: p.systemLayerLines?.personal || [], text: p.planetGroups.personal || "" },
    { key: "collective", title: "外の層", sub: "COLLECTIVE LAYER", lines: p.systemLayerLines?.collective || [], text: p.planetGroups.socialTranspersonal || p.planetGroups.social || "" },
  ].map((row) => {
    const text = `${(row.lines || []).join(" ")} ${row.text || ""}`.trim();
    const height = estimateBlockHeight({ text });
    const html = [
      `<div class="chart-box full-width">`,
      `<div class="card-head">${row.title}</div>`,
      `<div class="card-sub">${row.sub}</div>`,
      row.lines?.length ? `<div class="card-list inline">${row.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}</div>` : "",
      `<div class="card-body text-block">${renderRichText(row.text)}</div>`,
      `</div>`,
    ].join("");
    return { html, height };
  });
  return paginateBlocks(layBlocks, { maxHeight: usableHeight, minUsage: 0.35 });
}

function buildDeepAxisPages({ p, usableHeight }) {
  const depBlocks = [
    {
      key: "node_north",
      title: `${buildGlyphImgTag("☊", { className: "glyph-img glyph-img--head", size: 22 })} ノースノード`,
      meta: [p.deepAxisMeta?.northMeta].filter(Boolean),
      role: DEEP_AXIS_ROLE_TAGLINES.north_node,
      text: p.deepAxis.nodesNorth || "",
    },
    {
      key: "node_south",
      title: `${buildGlyphImgTag("☋", { className: "glyph-img glyph-img--head", size: 22 })} サウスノード`,
      meta: [p.deepAxisMeta?.southMeta].filter(Boolean),
      role: DEEP_AXIS_ROLE_TAGLINES.south_node,
      text: p.deepAxis.nodesSouth || "",
    },
    {
      key: "chiron",
      title: `${buildGlyphImgTag("⚷", { className: "glyph-img glyph-img--head", size: 22 })} キロン`,
      meta: [p.deepAxisMeta?.chiron].filter(Boolean),
      role: [DEEP_AXIS_ROLE_TAGLINES.chiron].filter(Boolean),
      text: p.deepAxis.chiron || "",
    },
    {
      key: "lilith",
      title: `${buildGlyphImgTag("⚸", { className: "glyph-img glyph-img--head", size: 22 })} リリス`,
      meta: [p.deepAxisMeta?.lilith].filter(Boolean),
      role: [DEEP_AXIS_ROLE_TAGLINES.lilith].filter(Boolean),
      text: p.deepAxis.lilith || "",
    },
  ].map((row) => {
    const meta = Array.isArray(row.meta) ? row.meta : [];
    const roleLines = Array.isArray(row.role) ? row.role : row.role ? [row.role] : [];
    const text = [meta.join(" "), roleLines.join(" "), row.text].filter(Boolean).join(" ");
    let height = estimateBlockHeight({ text, sub: false });
    if (row.key === "node_north" || row.key === "node_south") height += 10;
    const metaInline = meta.length
      ? `<span class="card-meta-inline">${replaceGlyphsWithImages(wrapZodiacGlyphs(escapeHtml(meta[0])), { className: "glyph-img glyph-img--axis", size: 18 })}</span>`
      : "";
    const metaHtml = meta.length > 1
      ? meta
        .slice(1)
        .map((m, idx) => `<div class="card-meta ${idx ? "node-meta" : ""}">${replaceGlyphsWithImages(wrapZodiacGlyphs(escapeHtml(m)), { className: "glyph-img glyph-img--axis", size: 18 })}</div>`)
        .join("")
      : "";
    const roleHtml = roleLines.length
      ? roleLines.map((line) => `<div class="card-role">${escapeHtml(line)}</div>`).join("")
      : "";
    const stripRoleLines = (textValue, lines) => {
      if (!textValue || !lines.length) return textValue || "";
      let out = String(textValue).trimStart();
      lines.forEach((line) => {
        if (out.startsWith(line)) {
          out = out.slice(line.length).replace(/^\s*\n/, "");
        }
      });
      return out;
    };
    const bodyText = stripRoleLines(row.text, roleLines);
    const bodyHtml = bodyText ? `<div class="card-text text-block">${renderRichText(bodyText)}</div>` : "";
    const html = [
      `<div class="card">`,
      `<div class="card-title">${row.title}${metaInline}</div>`,
      "",
      metaHtml,
      roleHtml,
      bodyHtml,
      `</div>`,
    ].join("");
    return { html, height };
  });
  return paginateBlocks(depBlocks, { maxHeight: usableHeight, minUsage: 0.35 });
}

function buildAspectPages({ p, usableHeight }) {
  const aspBlocks = [
    {
      key: "aspects",
      title: "主要アスペクト",
      sub: "CORE ASPECTS",
      text: (p.aspectMap || []).join(" "),
      html: [
        `<div class="chart-box full-width">`,
        `<div class="card-head">主要アスペクト</div>`,
        `<div class="card-sub">CORE ASPECTS</div>`,
        `<div class="card-body text-block"><ul class="aspect-list">${(p.aspectMap || []).map((text) => `<li>${renderInlineText(text)}</li>`).join("")}</ul></div>`,
        `</div>`,
      ].join(""),
    },
  ].map((row) => ({ html: row.html, height: estimateBlockHeight({ text: row.text }) }));
  return paginateBlocks(aspBlocks, { maxHeight: usableHeight, minUsage: 0.35 });
}

module.exports = {
  buildPlanetPages,
  buildLayerPages,
  buildDeepAxisPages,
  buildAspectPages,
};
