"use strict";

/**
 * engine/close_picker.js
 * - Xの締め2行（72セット）を「カテゴリ→安定抽選」で選ぶ
 * - 断定/指示を増やさない（カテゴリ選択は“状態”で決める）
 */

function safeStr(v) {
  return typeof v === "string" ? v : "";
}
function safeNum(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * story から “雰囲気メタ” を拾う（無ければ推定）
 * 期待フィールド（あると嬉しい）：
 * - story.meta?.yoin?.topElement / topModality / aspectLabel / density
 * - story.public?.tone_hints（もしあれば）
 */
function getMoodMeta(story) {
  const meta = story?.meta || {};
  if (format === "json") return res.json({ ok: true, saved, doc_id, meta, story, channel: ch, mode });

  // 直接入ってるのを最優先
  const topElement = safeStr(y.topElement);
  const topModality = safeStr(y.topModality);
  const aspectLabel = safeStr(y.aspectLabel);

  // density は 0..1 想定（無ければ contactCount から推定）
  const density = safeNum(y.density);

  // 接触数：public.sky_top / personal.touch_points_top3 から推定
  const publicTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top.length : 0;
  const personalTop = Array.isArray(story?.personal?.touch_points_top3) ? story.personal.touch_points_top3.length : 0;
  const contactCount = publicTop + personalTop;

  // 推定 density（適当な線形）
  const densityGuess =
    density !== null ? density : Math.max(0, Math.min(1, contactCount / 6));

  // tone_hints があるなら一応拾う（文字列配列想定）
  const toneHints = Array.isArray(story?.public?.tone_hints)
    ? story.public.tone_hints.map(String)
    : [];

  return { topElement, topModality, aspectLabel, density: densityGuess, contactCount, toneHints };
}

/**
 * カテゴリ選択ルール表（ここが本体）
 * - まず “少ない日” を優先（quiet/reset）
 * - 次に “摩擦/境界” を優先
 * - 次に “火/動き/拡張/接続” を振り分け
 * - 最後に “統合/漂い” を拾う
 */
function pickCloseCategory(story) {
  const { topElement, topModality, aspectLabel, density, contactCount, toneHints } = getMoodMeta(story);

  // ---- 0) 接触が少ない = quiet/reset 優先
  if (contactCount <= 1 || density <= 0.18) return "quiet";
  if (density <= 0.30) return "reset";

  // ---- 1) toneHints に明示がある場合（任意）
  const hint = toneHints.join(" ").toLowerCase();
  if (hint.includes("boundary")) return "boundary";
  if (hint.includes("friction")) return "friction";
  if (hint.includes("connect")) return "connect";
  if (hint.includes("expand")) return "expand";
  if (hint.includes("focus")) return "focus";
  if (hint.includes("move")) return "move";

  // ---- 2) aspectLabel で振り分け（あなたのYOIN.BUILDで使ってる “質感ラベル” が入る想定）
  const a = aspectLabel;
  if (a.includes("摩擦") || a.includes("緊張") || a.includes("衝突") || a.includes("すれ違い")) return "friction";
  if (a.includes("保護") || a.includes("境界") || a.includes("守る") || a.includes("線引き")) return "boundary";
  if (a.includes("協力") || a.includes("接続") || a.includes("交差") || a.includes("対話")) return "connect";
  if (a.includes("チャンス") || a.includes("拡張") || a.includes("選択肢")) return "expand";
  if (a.includes("集中") || a.includes("収束") || a.includes("精度")) return "focus";
  if (a.includes("開始") || a.includes("推進") || a.includes("着手")) return "move";
  if (a.includes("統合") || a.includes("混合") || a.includes("編み直し")) return "integrate";
  if (a.includes("余韻") || a.includes("浸透") || a.includes("漂う")) return "drift";

  // ---- 3) element / modality で補助
  if (topElement === "earth") return "anchor";
  if (topElement === "fire") return density >= 0.60 ? "spark" : "move";
  if (topElement === "air") return density >= 0.55 ? "connect" : "expand";
  if (topElement === "water") return density >= 0.55 ? "drift" : "quiet";

  if (topModality === "cardinal") return "move";
  if (topModality === "fixed") return "anchor";
  if (topModality === "mutable") return "integrate";

  // ---- fallback
  return "focus";
}

/**
 * 安定抽選で 2行セットを返す
 * pickStable は既存のを使う前提（無ければ 0番）
 */
function pickCloseLines(RENDER_COPY, story, { seedBase, pickStable } = {}) {
  const cat = pickCloseCategory(story);

  const pools = RENDER_COPY?.X_FORMAT?.CLOSE_LINES_BY_CATEGORY || {};
  const pool = Array.isArray(pools[cat]) ? pools[cat] : null;

  if (!pool || pool.length === 0) {
    // 最低限の安全fallback（2行）
    return ["空気は一方向じゃない。", "読む場所は、選んでいい。"];
  }

  if (typeof pickStable === "function" && seedBase) {
    const picked = pickStable(pool, `${seedBase}|close|${cat}`);
    return Array.isArray(picked) ? picked : pool[0];
  }
  return pool[0];
}

module.exports = { pickCloseCategory, pickCloseLines };
