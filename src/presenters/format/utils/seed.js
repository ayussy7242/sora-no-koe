"use strict";

/**
 * seed.js — stable randomness helpers (v3.3.3)
 * - hash32: FNV-1a-ish
 * - pickStable: stable pick by seed
 * - getUserId: absorbs user_id variations
 */

function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickStable(arr, seedStr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  const idx = hash32(String(seedStr || "")) % arr.length;
  return arr[idx];
}

// ✅ user_id の揺れを全部吸収（metaに足したなら meta.user_id が最優先）
function getUserId(story) {
  return (
    story?.meta?.user_id ||
    story?.personal?.user_id ||
    story?.meta?.app_user_id ||
    story?.meta?.appUserId ||
    story?.meta?.userId ||
    "public"
  );
}

module.exports = { hash32, pickStable, getUserId };
