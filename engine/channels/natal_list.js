"use strict";

/**
 * engine/render_parts/channels/natal_list.js
 *
 * 役割:
 * - LINEコマンド「わたしのほし」用の表示を生成
 * - natal_cache doc から asc/mc と 10天体のサイン度数を整形して返す
 *
 * ポリシー:
 * - 判断しない（no prediction / no should / no good-bad）
 * - 欠損に強い（doc構造が多少違っても拾えるだけ拾う）
 *
 * 注入するdeps（ctx.js から渡す想定）:
 * - signJaFromIndex(signIndex:number): string   // 0..11 -> "牡羊座" 等
 * - fmtBodyJa(key:string): string              // "sun" -> "太陽" 等
 * - fmtPointJa(key:string): string             // "asc" -> "asc"等の表示ラベル
 * - RENDER_COPY: object                        // copy/render.js の SSOT
 *
 * Export:
 * - createNatalListRenderer({ ...deps }) -> { renderNatalListFromcache, lonToSignDegMin, pickAnglesFromNatalCache }
 */

function createNatalListRenderer({
  signJaFromIndex,
  fmtBodyJa,
  fmtPointJa,
  RENDER_COPY,
} = {}) {
  // ----------------------------
  // helpers
  // ----------------------------

  function lonToSignDegMin(lonDeg) {
    const x = Number(lonDeg);
    if (!Number.isFinite(x)) return null;

    const lon = ((x % 360) + 360) % 360;
    const signIndex = Math.floor(lon / 30);
    const within = lon - signIndex * 30;

    const deg = Math.floor(within);
    const min = Math.floor((within - deg) * 60 + 1e-9);

    const signJa =
      (typeof signJaFromIndex === "function" ? signJaFromIndex(signIndex) : null) || "（不明）";
    const mm = String(min).padStart(2, "0");
    return `${signJa} ${deg}°${mm}’`;
  }

  /**
   * natal_cache のいろんな形から asc/mc を拾う
   * - d.houses.angles.asc / mc
   * - d.min.angles.asc / mc
   * - d.angles / d.ascmc / d.natal_angles
   * - 最終 fallback: ハウスカスプ 1ハウス(asc) / 10ハウス(mc)
   */
  function pickAnglesFromNatalCache(d) {
    const angles =
      d?.houses?.angles ||
      d?.min?.angles ||
      d?.angles ||
      d?.ascmc ||
      d?.natal_angles ||
      d?.min?.ascmc ||
      null;

    let asc =
      angles?.asc ?? angles?.asc ?? angles?.asc_deg ??
      d?.min?.asc ?? d?.min?.asc ??
      d?.asc ?? d?.asc ??
      null;

    let mc =
      angles?.mc ?? angles?.mc ?? angles?.mc_deg ??
      d?.min?.mc ?? d?.min?.mc ??
      d?.mc ?? d?.mc ??
      null;

    // fallback: house cusp 1 / 10
    if (!Number.isFinite(Number(asc))) asc = d?.["1"] ?? d?.[1] ?? asc;
    if (!Number.isFinite(Number(mc))) mc = d?.["10"] ?? d?.[10] ?? mc;

    return { asc, mc };
  }

  /**
   * 表示生成本体
   * @param {object} natalCacheDoc Firestore の natal_cache doc（または同等オブジェクト）
   * @returns {string}
   */
  function renderNatalListFromcache(natalCacheDoc) {
    const d = natalCacheDoc || {};

    // bodies のあり得る配置を全部拾う
    const bodies =
      d?.min?.bodies ||
      d?.min?.natal_positions ||
      d?.natal_positions ||
      d?.positions ||
      null;

    if (!bodies || typeof bodies !== "object") {
      return typeof RENDER_COPY?.NATAL_LIST?.NOT_READY === "function"
        ? RENDER_COPY.NATAL_LIST.NOT_READY()
        : "まだ計算中です。少し待ってからもう一度。";
    }

    const { asc, mc } = pickAnglesFromNatalCache(d);
    if (!Number.isFinite(Number(asc)) || !Number.isFinite(Number(mc))) {
      return typeof RENDER_COPY?.NATAL_LIST?.MISSING_ANGLES === "function"
        ? RENDER_COPY.NATAL_LIST.MISSING_ANGLES()
        : "asc/mc が取得できませんでした。出生情報を確認してください。";
    }

    const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

    const glyph = {
      sun: "☉",
      moon: "☽",
      mercury: "☿",
      venus: "♀",
      mars: "♂",
      jupiter: "♃",
      saturn: "♄",
      uranus: "♅",
      neptune: "♆",
      pluto: "♇",
      asc: "asc",
      mc: "mc",
    };

    const safeFmtPoint = (k) => (typeof fmtPointJa === "function" ? fmtPointJa(k) : String(k));
    const safeFmtBody = (k) => (typeof fmtBodyJa === "function" ? fmtBodyJa(k) : String(k));

    const lines = [];
    lines.push(`${glyph.asc} ${safeFmtPoint("asc")}：${lonToSignDegMin(asc)}`);
    lines.push(`${glyph.mc}  ${safeFmtPoint("mc")}：${lonToSignDegMin(mc)}`);
    lines.push("");

    for (const k of order) {
      const v = bodies?.[k];
      const str = lonToSignDegMin(v);
      if (!str) continue;
      const label = safeFmtBody(k);
      lines.push(`${glyph[k]} ${label}：${str}`);
    }

    const head = RENDER_COPY?.HEAD_NATAL_LIST || "【わたしの星】";
    const note = typeof RENDER_COPY?.NATAL_LIST?.NOTE === "function" ? RENDER_COPY.NATAL_LIST.NOTE() : "";
    return [head, "", ...lines, note].filter(Boolean).join("\n");
  }

  return {
    lonToSignDegMin,
    pickAnglesFromNatalCache,
    renderNatalListFromcache,
  };
}

module.exports = { createNatalListRenderer };
