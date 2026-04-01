"use strict";

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRawBlock(block = {}) {
  const out = [];
  if (block?.title) out.push(`<h2>${escapeHtml(block.title)}</h2>`);
  if (Array.isArray(block?.facts) && block.facts.length) {
    block.facts.forEach((fact) => out.push(`<p>${escapeHtml(fact)}</p>`));
  }
  if (Array.isArray(block?.items) && block.items.length) {
    if (block.itemsAsH3) {
      block.items.forEach((item) => out.push(`<h3>${escapeHtml(item)}</h3>`));
    } else {
      block.items.forEach((item) => out.push(`<p>${escapeHtml(item)}</p>`));
    }
  }
  return out.join("\n");
}

function renderBlocksPreview(blocks = []) {
  const out = [];
  blocks.forEach((block) => {
    if (block?.title) out.push(`<h2>${escapeHtml(block.title)}</h2>`);
    if (Array.isArray(block?.facts) && block.facts.length) {
      out.push(`<p>${escapeHtml(block.facts.join(" / "))}</p>`);
    }
    if (Array.isArray(block?.items) && block.items.length) {
      if (block.itemsAsH3) {
        block.items.forEach((item, idx) => {
          out.push(`<h3>${idx + 1}. ${escapeHtml(item)}</h3>`);
        });
      } else {
        block.items.forEach((item) => {
          out.push(`<p>${escapeHtml(item)}</p>`);
        });
      }
    }
  });
  return out.join("\n");
}

function splitIntoParagraphs(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const parts = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts;

  const chunks = s.split(/。/).map((p, i, arr) => {
    const t = String(p || "").trim();
    if (!t) return "";
    return i < arr.length - 1 ? `${t}。` : t;
  }).filter(Boolean);

  if (chunks.length >= 4) {
    const first = Math.ceil(chunks.length / 3);
    const second = Math.ceil((chunks.length - first) / 2);
    return [
      chunks.slice(0, first).join(""),
      chunks.slice(first, first + second).join(""),
      chunks.slice(first + second).join(""),
    ].filter(Boolean);
  }
  if (chunks.length >= 3) {
    const mid = Math.ceil(chunks.length / 2);
    return [
      chunks.slice(0, mid).join(""),
      chunks.slice(mid).join(""),
    ].filter(Boolean);
  }
  return [s];
}

function pushParagraphs(lines, text) {
  const paras = splitIntoParagraphs(text);
  if (!paras.length) return;
  paras.forEach((p) => {
    lines.push(`<p>${escapeHtml(p)}</p>`);
  });
}

function markdownToHtml(text, opts = {}) {
  const h1 = String(opts.h1 || "").trim();
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  const out = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.join(" ")}</p>`);
    para = [];
  };

  const pushHeading = (level, title) => {
    flushPara();
    out.push(`<h${level}>${escapeHtml(title)}</h${level}>`);
  };

  if (h1) {
    out.push(`<h1>${escapeHtml(h1)}</h1>`);
  }

  for (const line of lines) {
    const t = String(line || "").trim();
    if (!t) {
      flushPara();
      continue;
    }
    if (t.startsWith("### ")) {
      pushHeading(3, t.slice(4).trim());
      continue;
    }
    if (t.startsWith("## ")) {
      pushHeading(2, t.slice(3).trim());
      continue;
    }
    if (t.startsWith("# ")) {
      pushHeading(1, t.slice(2).trim());
      continue;
    }
    para.push(escapeHtml(t));
  }
  flushPara();
  return out.join("\n");
}

function softenText(text) {
  return String(text || "");
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enforceSingleClosing(text, closing) {
  const s = String(text || "").trim();
  if (!s) return closing;

  const closingLines = closing.split("\n").map((line) => line.trim());
  const closingPattern = closingLines
    .map((line) => escapeRegex(line))
    .join("\\s*\\n+\\s*");
  const closingRegex = new RegExp(closingPattern, "g");

  const body = s.replace(closingRegex, "").trim().replace(/\n+$/g, "").trim();
  return `${body}\n\n\n${closing}`.trim();
}

module.exports = {
  escapeHtml,
  renderRawBlock,
  renderBlocksPreview,
  splitIntoParagraphs,
  pushParagraphs,
  markdownToHtml,
  softenText,
  enforceSingleClosing,
};
