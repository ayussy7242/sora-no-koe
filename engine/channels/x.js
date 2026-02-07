"use strict";

/**
 * channels/x.js
 * - X（短文） v3.3.6 相当：空の配置 + dist(なう惑星) + 余韻 + close
 *
 * deps:
 * - getUserId, pickStable
 * - fmt(formatSkyLineX/formatYoinForX/buildYoinBlocks)
 * - pickCenterPublicContact, pickSecretPublicContact
 * - buildYoinLine, buildYoinGlobal
 * - buildNowModernPlanetCounts, buildDistLinesFromcounts
 * - pickCloseLines
 * - RENDER_COPY
 * - fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg
 */

function renderX(story, deps = {}) {
  const { buildNowModernPlanetCounts, fmtAnyJa, publicSignJa, fmtAspectJa } = deps || {};
  const dict = deps?.dict || require("../../dict");

  const isFiniteNum = (n) => Number.isFinite(n);

  const emojiForBody = (key) => {
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
      lilith: "⚸",
    };
    return map[k] || "";
  };

  const moonPhaseInfo = () => {
    const moonLon = story?.public?.moon?.lon_deg ?? story?.public?.transit_signs?.moon?.lon_deg;
    const sunLon = story?.public?.transit_signs?.sun?.lon_deg;
    if (!isFiniteNum(moonLon) || !isFiniteNum(sunLon)) return null;
    const diff = (Number(moonLon) - Number(sunLon) + 360) % 360;
    const idx = Math.floor((diff + 22.5) / 45) % 8;
    const names = ["新月","三日月","上弦の月","十三夜","満月","寝待月","下弦の月","三十日月"];
    const emojis = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
    return { name: names[idx], emoji: emojis[idx] };
  };

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const sunSign =
    story?.public?.transit_signs?.sun?.sign_ja ||
    (typeof publicSignJa === "function" ? publicSignJa(story, "sun") : "");
  const moonSign =
    story?.public?.moon?.sign_ja ||
    (typeof publicSignJa === "function" ? publicSignJa(story, "moon") : "");
  const phase = moonPhaseInfo();
  const sunLine = sunSign ? `☀️太陽：${sunSign}` : "";
  const moonLine = moonSign ? `🌙月：${moonSign}${phase?.name ? `（${phase.name}）` : ""}` : "";

  const top = (() => {
    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    if (skyTop.length) return skyTop[0];
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
      .filter((r) => isFiniteNum(r?.orb_deg))
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));
    return sorted[0] || null;
  })();

  const signJaFromItem = (item, bodyKey, rawSign) => {
    const raw = String(rawSign || "");
    if (raw && /座$/.test(raw)) return raw;
    if (typeof publicSignJa === "function") {
      const s = publicSignJa(story, bodyKey);
      if (s) return s;
    }
    return raw;
  };

  const aspectLabel = (typeRaw) => {
    if (typeof fmtAspectJa === "function") {
      const v = fmtAspectJa(typeRaw);
      if (v) return String(v).trim();
    }
    return String(typeRaw || "").trim();
  };

  const resonanceLine = (() => {
    if (!top) return "";
    const aLabel = typeof fmtAnyJa === "function" ? fmtAnyJa(top.a) : String(top.a || "");
    const bLabel = typeof fmtAnyJa === "function" ? fmtAnyJa(top.b) : String(top.b || "");
    const aSign = signJaFromItem(top, top.a, top?.a_sign_ja || top?.a_sign || top?.aS || top?.a_sign_key);
    const bSign = signJaFromItem(top, top.b, top?.b_sign_ja || top?.b_sign || top?.bS || top?.b_sign_key);
    const aEmoji = emojiForBody(top.a);
    const bEmoji = emojiForBody(top.b);
    const asp = aspectLabel(top?.type || top?.aspect || top?.aspT || top?.aspectType);
    const orb = isFiniteNum(top?.orb_deg) ? Number(top.orb_deg).toFixed(1) : "";
    const aPart = `${aEmoji ? `${aEmoji} ` : ""}${aLabel}${aSign ? ` ${aSign}` : ""}`.trim();
    const bPart = `${bEmoji ? `${bEmoji} ` : ""}${bLabel}${bSign ? ` ${bSign}` : ""}`.trim();
    const orbText = orb ? ` ${orb}°` : "";
    return `☄️共鳴：${aPart} × ${bPart}｜${asp}${orbText}`;
  })();

  const kwLine = (() => {
    if (!top) return "";
    const normalizeAspect = (raw) => {
      const x = String(raw || "").trim().toLowerCase();
      if (!x) return "";
      const base = x.replace(/_\d+$/, "");
      const map = {
        inconjunct: "quincunx_150",
        quincunx: "quincunx_150",
        semisquare: "semi_square_45",
        semi_square: "semi_square_45",
        sesquisquare: "sesqui_square_135",
        sesqui_square: "sesqui_square_135",
      };
      return map[base] || base;
    };

    const ASPECTS_META = Object.assign(
      {},
      dict?.ASPECTS_V2?.major || {},
      dict?.ASPECTS_V2?.deep_space || {},
      dict?.ASPECTS_V2?.craft_space || {}
    );
    const aspectKey = normalizeAspect(top?.type || top?.aspect || top?.aspT || top?.aspectType);
    const meta = ASPECTS_META?.[aspectKey] || null;
    const aSignKey = String(top?.a_sign_key || top?.aS || top?.a_sign || "").toLowerCase();
    const bSignKey = String(top?.b_sign_key || top?.bS || top?.b_sign || "").toLowerCase();
    const aKw = (dict?.SIGNS_V2?.signs?.[aSignKey]?.keywords || []).slice(0);
    const bKw = (dict?.SIGNS_V2?.signs?.[bSignKey]?.keywords || []).slice(0);
    const aspKw = []
      .concat(meta?.feel || [])
      .concat(meta?.relation ? [meta.relation] : [])
      .concat(meta?.core ? [meta.core] : []);
    const pool = []
      .concat(aKw, bKw, aspKw)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .filter((s) => s.length <= 12 && !/やすい|として|によって/.test(s));
    if (!pool.length) return "";

    const hash32 = (str) => {
      let h = 2166136261;
      for (let i = 0; i < String(str || "").length; i++) {
        h ^= String(str).charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const pickMany = (arr, seed, count) => {
      const a = arr.slice();
      const out = [];
      for (let i = 0; i < count && a.length; i++) {
        const idx = hash32(`${seed}|${i}`) % a.length;
        out.push(a.splice(idx, 1)[0]);
      }
      return out;
    };

    const uniq = [];
    const seen = new Set();
    for (const w of pool) {
      if (seen.has(w)) continue;
      seen.add(w);
      uniq.push(w);
    }
    const picks = pickMany(uniq, `${dateLabel}|x|kw`, 3);
    if (!picks.length) return "";
    return `KeyWord: ${picks.join(" / ")}`;
  })();

  const counts = typeof buildNowModernPlanetCounts === "function" ? buildNowModernPlanetCounts(story) : null;
  const element = counts?.element || story?.public?.sky_strata?.element_count || {};
  const modality = counts?.modality || story?.public?.sky_strata?.modality_count || {};
  const fire = Number(element.fire || 0);
  const earth = Number(element.earth || 0);
  const air = Number(element.air || 0);
  const water = Number(element.water || 0);
  const cardinal = Number(modality.cardinal || 0);
  const fixed = Number(modality.fixed || 0);
  const mutable = Number(modality.mutable || 0);

  const elLine = `要素: 🔥火${fire} 🪨地${earth} 💨風${air} 💧水${water}`;
  const modLine = `区分: 🏃活${cardinal} 🧱不${fixed} 🌿柔${mutable}`;

  const domLine = (() => {
    const elemEntries = [
      ["火", fire],
      ["地", earth],
      ["風", air],
      ["水", water],
    ].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const modEntries = [
      ["活動", cardinal],
      ["不動", fixed],
      ["柔軟", mutable],
    ].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!elemEntries.length || !modEntries.length) return "";
    return `${elemEntries[0][0]}×${modEntries[0][0]}。`;
  })();

  const lines = [];
  lines.push(`🌌 ${dateLabel}｜空の配置`);
  lines.push("");
  if (sunLine) {
    lines.push(sunLine);
    lines.push("");
  }
  if (moonLine) {
    lines.push(moonLine);
    lines.push("");
  }
  if (resonanceLine) {
    lines.push(resonanceLine);
    if (kwLine) lines.push(kwLine);
    lines.push("");
  }
  lines.push(elLine);
  lines.push(modLine);
  if (domLine) {
    lines.push("");
    lines.push(domLine);
  }
  lines.push("");
  lines.push("星は語る。🌎🛸");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { renderX };
