"use strict";

function countChars(text) {
  return Array.from(String(text || "")).length;
}

function splitTrailingHashtags(text) {
  const raw = String(text || "");
  const trimmed = raw.trim();
  if (!trimmed) return { body: "", tags: [], separator: " " };

  let rest = trimmed;
  const tags = [];
  let separator = " ";

  while (true) {
    const m = rest.match(/(\s*)(#[^\s#]+)\s*$/);
    if (!m) break;
    const tag = m[2];
    tags.unshift(tag);
    if (m[1]) separator = m[1];
    rest = rest.slice(0, rest.length - m[0].length);
    if (!rest.trim()) {
      rest = "";
      break;
    }
  }

  return { body: rest.trim(), tags, separator: separator || " " };
}

function joinBodyAndTags(body, tags, opts = {}) {
  const sep = opts.separator != null ? String(opts.separator) : " ";
  const cleanBody = String(body || "").trim();
  const cleanTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!cleanBody && !cleanTags.length) return "";
  if (!cleanBody) return cleanTags.join(" ").trim();
  if (!cleanTags.length) return cleanBody;
  return `${cleanBody}${sep}${cleanTags.join(" ")}`.trim();
}

function trimTrailingHashtagsToMaxChars(text, maxChars, opts = {}) {
  const raw = String(text || "");
  if (!Number.isFinite(Number(maxChars)) || maxChars <= 0) return raw;

  const split = splitTrailingHashtags(raw);
  if (!split.tags.length) return raw;

  const separator = opts.separator != null ? String(opts.separator) : split.separator;
  let tags = split.tags.slice();
  let out = joinBodyAndTags(split.body, tags, { separator });
  while (tags.length && countChars(out) > maxChars) {
    tags.pop();
    out = joinBodyAndTags(split.body, tags, { separator });
  }
  return out;
}

module.exports = {
  countChars,
  splitTrailingHashtags,
  joinBodyAndTags,
  trimTrailingHashtagsToMaxChars,
};
