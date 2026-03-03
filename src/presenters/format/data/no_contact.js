"use strict";

/**
 * no_contact.js
 * - 接点が無い/出せない時の seeded 文章生成
 * - ここは copy(NO_CONTACT) と seed(pickStable) のみで文章を返す
 * - “判断” はせず、月のサインの質感を “記録文” として出す
 *
 * 注入するdeps:
 * - pickStable, getUserId, memoSignMeta, RENDER_COPY
 */

function buildNoContactLine(story, deps = {}) {
  const { pickStable, getUserId, memoSignMeta, RENDER_COPY } = deps || {};

  // --- ultra-safe guards
  const dateLocal = String(story?.meta?.date_local || "").trim();
  const userId = typeof getUserId === "function" ? getUserId(story) : "u_unknown";
  const seedBase = `${dateLocal || "date_unknown"}|${userId}|no_contact`;

  const moonKey = String(story?.public?.moon?.sign_key || "").toLowerCase();
  const signMeta = moonKey && typeof memoSignMeta === "function" ? memoSignMeta(moonKey) : null;

  const element = signMeta?.element || null;
  const modality = signMeta?.modality || null;
  const signJa = signMeta?.label_ja || story?.public?.moon?.sign_ja || null;

  // copy(NO_CONTACT) が無い場合のフォールバック（占わない・決めない）
  const pools = RENDER_COPY?.NO_CONTACT;
  if (!pools || typeof pickStable !== "function") {
    const head = signJa ? `🌙月：${signJa}` : "";
    const body = "今日は、接点がはっきり出ない配置として扱う。";
    return [head, body].filter(Boolean).join("\n");
  }

  // head
  const head =
    typeof pools.headmoonTaste === "function"
      ? pools.headmoonTaste(signJa)
      : (signJa ? `🌙月：${signJa}` : "");

  // element line
  const aPool =
    (element && pools.byElement?.[element]) ||
    pools.byElement?.default ||
    ["今日は、要素の質感だけが残りやすい。"];
  const a = pickStable(aPool, seedBase + "|a");

  // modality line
  const bPool =
    (modality && pools.byModality?.[modality]) ||
    pools.byModality?.default ||
    [""];
  const b = pickStable(bPool, seedBase + "|b") || "";

  // glue
  if (typeof pools.glue === "function") {
    return pools.glue(head, a, b);
  }
  return [head, a, b].filter(Boolean).join("\n");
}

module.exports = { buildNoContactLine };
