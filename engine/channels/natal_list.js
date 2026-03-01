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
    return `${signJa} ${deg}°${mm}'`;
  }

  function lonToSignOnly(lonDeg) {
    const x = Number(lonDeg);
    if (!Number.isFinite(x)) return null;
    const lon = ((x % 360) + 360) % 360;
    const signIndex = Math.floor(lon / 30);
    return (typeof signJaFromIndex === "function" ? signJaFromIndex(signIndex) : null) || "（不明）";
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
      angles?.asc ?? angles?.ASC ?? angles?.asc_deg ?? angles?.ASC_deg ??
      d?.min?.asc ?? d?.min?.asc_deg ?? d?.min?.ASC ?? d?.min?.ASC_deg ??
      d?.asc ?? d?.ASC ??
      null;

    let mc =
      angles?.mc ?? angles?.MC ?? angles?.mc_deg ?? angles?.MC_deg ??
      d?.min?.mc ?? d?.min?.mc_deg ?? d?.min?.MC ?? d?.min?.MC_deg ??
      d?.mc ?? d?.MC ??
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

    const orderMain = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const orderSpecial = ["lilith", "chiron"];

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
      lilith: "⚸",
      chiron: "⚷",
      north_node: "☊",
      south_node: "☋",
    };

    const safeFmtBody = (k) => (typeof fmtBodyJa === "function" ? fmtBodyJa(k) : String(k));
    const labelOverride = {
      lilith: "リリス",
      chiron: "キロン",
      north_node: "北ノード",
      south_node: "南ノード",
    };
    const bodyLabel = (k) => labelOverride[k] || safeFmtBody(k);

    const lines = [];

    const SIGN_KEYS = [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];
    const SIGNS_V2 = require("../../dict").SIGNS_V2 || {};
    const sigMeta = (lon) => {
      const v = Number(lon);
      if (!Number.isFinite(v)) return null;
      const lonNorm = ((v % 360) + 360) % 360;
      const idx = Math.floor(lonNorm / 30);
      const key = SIGN_KEYS[idx];
      return SIGNS_V2.signs?.[key] || null;
    };

    const element = { fire: 0, earth: 0, air: 0, water: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0 };

    const bodiesLower = (() => {
      const out = {};
      for (const [k, v] of Object.entries(bodies || {})) {
        const key = String(k || "").trim();
        if (!key) continue;
        const lower = key.toLowerCase();
        out[lower] = v;
      }
      return out;
    })();

    // fill missing optional bodies (lilith / chiron / nodes) if cache lacks them
    const needsLilith = bodiesLower.lilith == null;
    const needsChiron = bodiesLower.chiron == null;
    const needsNorthNode =
      bodiesLower.north_node == null &&
      bodiesLower.true_node == null &&
      bodiesLower.mean_node == null &&
      bodiesLower.northnode == null &&
      bodiesLower.node == null &&
      bodiesLower.rahu == null;
    const needsSouthNode =
      bodiesLower.south_node == null &&
      bodiesLower.southnode == null &&
      bodiesLower.sn == null &&
      bodiesLower.ketu == null;

    if (needsLilith || needsChiron || needsNorthNode || needsSouthNode) {
      const birth = d?.birth || {};
      const dateLocal = birth?.date_local || null;
      const timeHm = birth?.time_hm || null;
      const tz = birth?.timezone || null;

      if (dateLocal && timeHm && (!tz || tz === "Asia/Tokyo")) {
        try {
          const { swisseph } = require("../../config/swisseph");
          const iso = `${dateLocal}T${timeHm}:00+09:00`;
          const dd = new Date(iso);
          if (!Number.isNaN(dd.getTime()) && swisseph) {
            const y = dd.getUTCFullYear();
            const m = dd.getUTCMonth() + 1;
            const day = dd.getUTCDate();
            const hour =
              dd.getUTCHours() +
              dd.getUTCMinutes() / 60 +
              dd.getUTCSeconds() / 3600 +
              dd.getUTCMilliseconds() / 3600000;
            const jdUt = swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
            const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
            if (needsLilith && swisseph.SE_MEAN_APOG != null) {
              const out = swisseph.swe_calc_ut(jdUt, swisseph.SE_MEAN_APOG, flags);
              const lon1 = typeof out?.longitude === "number" ? out.longitude : out?.data?.[0];
              if (Number.isFinite(lon1)) bodiesLower.lilith = lon1;
            }
            if (needsChiron && swisseph.SE_CHIRON != null) {
              const out = swisseph.swe_calc_ut(jdUt, swisseph.SE_CHIRON, flags);
              const lon1 = typeof out?.longitude === "number" ? out.longitude : out?.data?.[0];
              if (Number.isFinite(lon1)) bodiesLower.chiron = lon1;
            }
            if (needsNorthNode || needsSouthNode) {
              const nodeId =
                swisseph.SE_TRUE_NODE != null ? swisseph.SE_TRUE_NODE :
                swisseph.SE_MEAN_NODE != null ? swisseph.SE_MEAN_NODE :
                null;
              if (nodeId != null) {
                const out = swisseph.swe_calc_ut(jdUt, nodeId, flags);
                const lon1 = typeof out?.longitude === "number" ? out.longitude : out?.data?.[0];
                if (Number.isFinite(lon1)) {
                  bodiesLower.north_node = lon1;
                  bodiesLower.south_node = (Number(lon1) + 180) % 360;
                }
              }
            }
          }
        } catch (_) {
          // optional: ignore if calc fails
        }
      }
    }

    const readBodyLonDirect = (key) => {
      if (!key) return undefined;
      const lower = String(key).toLowerCase();
      if (bodiesLower[lower] != null) return bodiesLower[lower];
      // legacy/odd casing (e.g. "Jupiter")
      const upperFirst = lower.charAt(0).toUpperCase() + lower.slice(1);
      if (bodies?.[upperFirst] != null) return bodies[upperFirst];
      return bodies?.[key];
    };

    const readBodyLon = (key) => {
      if (key === "north_node") {
        // true node first (最優先)
        const aliases = ["true_node", "north_node", "mean_node", "northnode", "nn", "node", "rahu"];
        for (const a of aliases) {
          const v = readBodyLonDirect(a);
          if (Number.isFinite(Number(v))) return v;
        }
        return undefined;
      }
      if (key === "south_node") {
        const aliases = ["south_node", "southnode", "sn", "ketu"];
        for (const a of aliases) {
          const v = readBodyLonDirect(a);
          if (Number.isFinite(Number(v))) return v;
        }
        return undefined;
      }
      return readBodyLonDirect(key);
    };

    const formatLine = (key, lon, { showDeg = true, suffix = "" } = {}) => {
      const signText = showDeg ? lonToSignDegMin(lon) : lonToSignOnly(lon);
      if (!signText) return "";
      const label = bodyLabel(key);
      const g = glyph[key] || "";
      const prefix = g ? `${g} ` : "";
      return `${prefix}${label}｜${signText}${suffix}`;
    };

    const bodyLines = [];
    const pushBody = (k) => {
      const v = readBodyLon(k);
      if (!Number.isFinite(Number(v))) return;
      const line = formatLine(k, v, { showDeg: true });
      if (!line) return;
      bodyLines.push(line);
      const meta = sigMeta(v);
      const e = String(meta?.element || "").toLowerCase();
      const m = String(meta?.modality || "").toLowerCase();
      if (element[e] !== undefined) element[e] += 1;
      if (modality[m] !== undefined) modality[m] += 1;
    };

    orderMain.forEach(pushBody);

    const specialLines = [];
    orderSpecial.forEach((k) => {
      const v = readBodyLon(k);
      if (!Number.isFinite(Number(v))) return;
      const line = formatLine(k, v, { showDeg: true });
      if (line) specialLines.push(line);
      const meta = sigMeta(v);
      const e = String(meta?.element || "").toLowerCase();
      const m = String(meta?.modality || "").toLowerCase();
      if (element[e] !== undefined) element[e] += 1;
      if (modality[m] !== undefined) modality[m] += 1;
    });

    let northLon = readBodyLon("north_node");
    let southLon = readBodyLon("south_node");
    if (Number.isFinite(Number(northLon))) {
      southLon = (Number(northLon) + 180) % 360;
    } else if (Number.isFinite(Number(southLon))) {
      northLon = (Number(southLon) + 180) % 360;
    }

    const nodeLines = [];
    if (Number.isFinite(Number(northLon))) {
      const line = formatLine("north_node", northLon, { showDeg: true });
      if (line) nodeLines.push(line);
    }
    if (Number.isFinite(Number(southLon))) {
      const line = formatLine("south_node", southLon, { showDeg: true });
      if (line) nodeLines.push(line);
    }

    const angleLines = [];
    const ascLine = lonToSignDegMin(asc);
    const mcLine = lonToSignDegMin(mc);
    const icLine = lonToSignDegMin(Number(mc) + 180);
    const dcLine = lonToSignDegMin(Number(asc) + 180);
    if (ascLine) angleLines.push(`ASC｜${ascLine}`);
    if (mcLine) angleLines.push(`MC｜${mcLine}`);
    if (icLine) angleLines.push(`IC｜${icLine}`);
    if (dcLine) angleLines.push(`DC｜${dcLine}`);

    const appendBlock = (block) => {
      if (!block.length) return;
      if (lines.length) lines.push("");
      lines.push(...block);
    };

    appendBlock(bodyLines);
    appendBlock(specialLines);
    appendBlock(nodeLines);
    appendBlock(angleLines);

    const total = element.fire + element.earth + element.air + element.water;
    if (total > 0) {
      // 余白を1行追加（見やすさ優先）
      lines.push("");
      lines.push(`🔥 火${element.fire} 🪨 地${element.earth} 💨 風${element.air} 💧 水${element.water}`);
      lines.push(`🏃 活動${modality.cardinal} 🧱 不動${modality.fixed} 🌿 柔軟${modality.mutable}`);
    }

    const head = RENDER_COPY?.HEAD_NATAL_LIST || "🌌 わたしのほし";
    // タイトル直下に余白を1行追加
    return [head, "", ...lines].filter((v) => v !== undefined && v !== null).join("\n");
  }

  return {
    lonToSignDegMin,
    pickAnglesFromNatalCache,
    renderNatalListFromcache,
  };
}

module.exports = { createNatalListRenderer };
