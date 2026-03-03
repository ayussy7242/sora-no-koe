"use strict";

function emojiForBody(key) {
  const k = String(key || "").toLowerCase();
  const map = {
    sun: "☀️",
    moon: "🌙",
    mercury: "☿️",
    venus: "♀️",
    mars: "♂️",
    jupiter: "♃",
    saturn: "♄",
    uranus: "♅",
    neptune: "♆",
    pluto: "♇",
    chiron: "⚷",
  };
  return map[k] || "";
}

function aspectDegFromMeta(aspectType, deps) {
  const k = String(aspectType || "").trim().toLowerCase();
  if (!k) return null;
  const meta = deps?.META?.ASPECTS_META?.[k];
  if (Number.isFinite(meta?.deg)) return Number(meta.deg);

  const d = deps?.dict?.ASPECTS_V2;
  const v =
    d?.major?.[k]?.deg ??
    d?.deep_space?.[k]?.deg ??
    d?.craft_space?.[k]?.deg ??
    d?.minor?.[k]?.deg ??
    null;
  return Number.isFinite(v) ? Number(v) : null;
}

module.exports = { emojiForBody, aspectDegFromMeta };
