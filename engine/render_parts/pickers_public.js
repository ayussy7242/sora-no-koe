"use strict";

/**
 * pickers_public.js
 * - public story から「中心」「ひそかな接点」を選ぶ
 * - ここは “判断” しない：規則/安定抽選のみ
 *
 * deps:
 * - pickStable(seed抽選)
 * - getUserId(ユーザーseed用)
 * - skyKey(同一接点判定用)
 */

function _sortedSkyAll(story) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  return skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .slice()
    .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));
}

function pickCenterPublicContact(story, deps = {}) {
  const { skyKey } = deps || {};
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  if (skyTop[0]) return skyTop[0];

  const sorted = _sortedSkyAll(story);
  // orb 最小を中心扱い（固定ルール）
  return sorted[0] || null;
}

function pickSecretPublicContact(story, deps = {}) {
  const { pickStable, getUserId, skyKey } = deps || {};

  const sorted = _sortedSkyAll(story);
  if (!sorted.length) return null;

  const dateLocal = String(story?.meta?.date_local || "").trim();
  const userId = typeof getUserId === "function" ? getUserId(story) : "u_unknown";
  const seedBase = `${dateLocal || "date_unknown"}|${userId}|secret_public`;

  const center = pickCenterPublicContact(story, deps);
  const centerK = center && typeof skyKey === "function" ? skyKey(center) : null;

  // 候補：中心/sky_top上位は避ける（「ひそか」枠）
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const topKeys = new Set(
    skyTop
      .slice(0, 3)
      .map((x) => (typeof skyKey === "function" ? skyKey(x) : null))
      .filter(Boolean)
  );

  const pool = sorted.filter((c) => {
    const k = typeof skyKey === "function" ? skyKey(c) : null;
    if (!k) return true;
    if (centerK && k === centerK) return false;
    if (topKeys.has(k)) return false;
    return true;
  });

  if (!pool.length) {
    // どうしても無ければ sorted から2番目
    return sorted[1] || null;
  }

  // 安定抽選（orbが近いものほど現れやすい → pool前方を厚く）
  if (typeof pickStable !== "function") return pool[0];

  const weights = pool.map((c) => {
    const orb = Math.max(0.0001, Number(c?.orb_deg));
    // 近いほど重く： 1/orb を軽く丸める
    return Math.min(12, Math.max(1, Math.round(3 / orb)));
  });

  const expanded = [];
  for (let i = 0; i < pool.length; i++) {
    const w = weights[i] || 1;
    for (let j = 0; j < w; j++) expanded.push(pool[i]);
  }

  return pickStable(expanded, seedBase) || pool[0];
}

module.exports = {
  pickCenterPublicContact,
  pickSecretPublicContact,
};
