"use strict";

const {
  FS_BODY,
  FS_SUB,
  FS_HEAD,
  LINE_HEIGHT,
  TEXT_MAX_WIDTH,
  SIGN_ELEMENT_MAP,
  SIGN_MODALITY_MAP,
  SIGN_NAME_TO_KEY,
  SIGN_JA,
  SIGN_JA_TO_KEY,
} = require("./constants");

function toNumber(val) {
  return Number.isFinite(Number(val)) ? Number(val) : 0;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRichText(text, { paragraphs = true } = {}) {
  const escaped = escapeHtml(text);
  const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  if (!paragraphs) return withStrong.replace(/\n/g, "<br/>");
  const blocks = withStrong.split(/\n{2,}/);
  return blocks
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function renderInlineText(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function estimateTextHeight(text, { fontSize = FS_BODY, lineHeight = LINE_HEIGHT, maxWidth = TEXT_MAX_WIDTH } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return 0;
  const avgCharWidth = fontSize * 0.56;
  const charsPerLine = Math.max(10, Math.floor(maxWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(raw.replace(/\n/g, "").length / charsPerLine));
  return lines * fontSize * lineHeight;
}

function estimateBlockHeight({ title = true, sub = true, text = "" } = {}) {
  const headHeight = title ? FS_HEAD * 1.2 + 8 : 0;
  const subHeight = sub ? FS_SUB * 1.6 + 8 : 0;
  const bodyHeight = estimateTextHeight(text);
  return headHeight + subHeight + bodyHeight + 24;
}

function paginateBlocks(blocks, { maxHeight, minUsage = 0.35 } = {}) {
  const pages = [];
  let current = [];
  let height = 0;
  blocks.forEach((block) => {
    if (current.length && height + block.height > maxHeight) {
      pages.push({ blocks: current, height });
      current = [];
      height = 0;
    }
    current.push(block);
    height += block.height;
  });
  if (current.length) pages.push({ blocks: current, height });
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const usage = last.height / maxHeight;
    if (usage < minUsage) {
      const prev = pages[pages.length - 2];
      if (prev.height + last.height <= maxHeight) {
        prev.blocks = prev.blocks.concat(last.blocks);
        prev.height += last.height;
        pages.pop();
      }
    }
  }
  return pages;
}

function resolveSignKey(row) {
  const rawKey = String(row?.sign_key || row?.sign_en || row?.sign || "").toLowerCase();
  if (SIGN_ELEMENT_MAP[rawKey] || SIGN_MODALITY_MAP[rawKey]) return rawKey;
  const ja = row?.sign_ja || row?.sign || "";
  if (SIGN_JA_TO_KEY[ja]) return SIGN_JA_TO_KEY[ja];
  const en = row?.sign_en || row?.sign || "";
  const enKey = SIGN_NAME_TO_KEY[String(en).toLowerCase()];
  return enKey || rawKey;
}

function formatSignJa(value) {
  if (!value) return "";
  if (SIGN_JA_TO_KEY[value]) return value;
  const key = SIGN_NAME_TO_KEY[String(value).toLowerCase()] || String(value).toLowerCase();
  return SIGN_JA[key] || value;
}

module.exports = {
  toNumber,
  escapeHtml,
  renderRichText,
  renderInlineText,
  estimateTextHeight,
  estimateBlockHeight,
  paginateBlocks,
  resolveSignKey,
  formatSignJa,
};
