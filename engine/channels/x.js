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
  const {
    getUserId,
    pickStable,
    fmt,
    pickCenterPublicContact,
    pickSecretPublicContact,
    buildYoinLine,
    buildYoinGlobal,
    buildNowModernPlanetCounts,
    buildDistLinesFromcounts,
    pickCloseLines,
    RENDER_COPY,
    fmtAnyJa,
    publicSignJa,
    publicSignKey,
    signMeta,
    fmtAspectJa,
    fmtDeg,
  } = deps || {};

  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
  const moonSignJa = story?.public?.moon?.sign_ja || "";

  const userSeed = typeof getUserId === "function" ? getUserId(story) : "u_unknown";
  const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}`;

  const yoinPack =
    typeof fmt?.buildYoinBlocks === "function"
      ? fmt.buildYoinBlocks(
          story,
          { channel: "x", seedBase: `${seedBase}|yoin` },
          { buildYoinLine, buildYoinGlobal, RENDER_COPY, pickStable }
        )
      : { xYoinLine: typeof buildYoinLine === "function" ? buildYoinLine(story) : "" };

  const center = typeof pickCenterPublicContact === "function" ? pickCenterPublicContact(story, deps) : null;
  let secret = typeof pickSecretPublicContact === "function" ? pickSecretPublicContact(story, deps) : null;
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

  function sameContact(a, b) {
    if (!a || !b) return false;
    return (
      String(a.a || "") === String(b.a || "") &&
      String(a.b || "") === String(b.b || "") &&
      String(a.type || "") === String(b.type || "") &&
      String(a.orb_deg || "") === String(b.orb_deg || "")
    );
  }

  if ((!secret || sameContact(center, secret)) && Array.isArray(story?.public?.sky_top) && story.public.sky_top[1]) {
    secret = story.public.sky_top[1];
  }

  function aspectKey(raw) {
    const x = String(raw || "").toLowerCase();
    if (x.startsWith("opposition")) return "opposition";
    if (x.startsWith("square")) return "square";
    if (x.startsWith("trine")) return "trine";
    if (x.startsWith("sextile")) return "sextile";
    if (x.startsWith("conjunction")) return "conjunction";
    if (x.startsWith("quincunx") || x.startsWith("inconjunct")) return "quincunx_150";
    if (x.startsWith("quintile")) return "quintile_72";
    if (x.startsWith("biquintile")) return "biquintile_144";
    if (x.startsWith("semi_square") || x.startsWith("semisquare")) return "semi_square_45";
    if (x.startsWith("sesqui_square") || x.startsWith("sesquisquare")) return "sesqui_square_135";
    if (x.startsWith("semi_sextile") || x.startsWith("semisextile")) return "semi_sextile_30";
    if (x.startsWith("novile")) return "novile_40";
    if (x.startsWith("binovile")) return "binovile_80";
    if (x.startsWith("quadranovile")) return "quadranovile_160";
    if (x.startsWith("decile")) return "decile_36";
    if (x.startsWith("tridecile")) return "tridecile_108";
    return x;
  }

  function aspectTone(key) {
    const k = String(key || "");
    if (k.includes("square") || k.includes("opposition")) return "tense";
    if (k.includes("quincunx") || k.includes("semi_square") || k.includes("sesqui_square") || k.includes("semi_sextile")) return "adjust";
    if (k.includes("trine") || k.includes("sextile")) return "smooth";
    if (k.includes("conjunction")) return "blend";
    if (k.includes("quintile") || k.includes("biquintile") || k.includes("decile") || k.includes("tridecile")) return "craft";
    if (k.includes("novile") || k.includes("binovile") || k.includes("quadranovile")) return "inward";
    return "adjust";
  }

  function pickTwoForX() {
    if (!skyAll.length) return { first: center, second: secret };
    const rare = new Set([
      "quintile_72","biquintile_144","semi_square_45","sesqui_square_135","semi_sextile_30","quincunx_150",
      "novile_40","binovile_80","quadranovile_160","decile_36","tridecile_108"
    ]);
    const list = skyAll.map((r) => {
      const k = aspectKey(r?.type || r?.aspectType || "");
      const orb = Math.max(0.001, Number(r?.orb_deg) || 99);
      const rarity = rare.has(k) ? 1.5 : 0;
      const score = (2 / orb) + rarity;
      return { r, score };
    }).sort((a,b) => b.score - a.score);
    const first = list[0]?.r || center || null;
    let second = null;
    for (let i = 1; i < list.length; i++) {
      if (!sameContact(first, list[i].r)) { second = list[i].r; break; }
    }
    return { first, second: second || secret || null };
  }

  const picked = pickTwoForX();
  const mainA = picked.first || center;
  const mainB = picked.second || secret;

  const main1 = mainA && typeof fmt?.formatSkyLineX === "function"
    ? fmt.formatSkyLineX(story, mainA, "☄️", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
    : "";
  const main2 = mainB && !sameContact(mainA, mainB) && typeof fmt?.formatSkyLineX === "function"
    ? fmt.formatSkyLineX(story, mainB, "🪐", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
    : "";

  let yoinSource = yoinPack?.xYoinLine;
  if (typeof buildYoinLine === "function") {
    yoinSource = buildYoinLine(story, { kind: "public", compact: true, statsScope: "top" });
  }
  const yoin = typeof fmt?.formatYoinForX === "function"
    ? fmt.formatYoinForX(yoinSource)
    : String(yoinSource || "");

  function buildDistShortFallback() {
    const element = { fire: 0, earth: 0, air: 0, water: 0, unknown: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0, unknown: 0 };
    const BODIES = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"];

    const addSignKey = (signKey) => {
      const s = typeof signMeta === "function" ? signMeta(signKey) : null;
      const e = String(s?.element || "").toLowerCase();
      const m = String(s?.modality || "").toLowerCase();
      if (element[e] !== undefined) element[e] += 1;
      if (modality[m] !== undefined) modality[m] += 1;
    };

    if (typeof publicSignKey === "function") {
      BODIES.forEach((bodyKey) => {
        const key = publicSignKey(story, bodyKey);
        if (key) addSignKey(key);
      });
    }

    if (element.fire + element.earth + element.air + element.water === 0) {
      const ts = story?.public?.transit_signs || {};
      BODIES.forEach((bodyKey) => {
        const key = ts?.[bodyKey];
        if (typeof key === "string") addSignKey(key);
        if (key?.sign_key) addSignKey(key.sign_key);
      });
    }

    const f = Number(element.fire || 0);
    const e = Number(element.earth || 0);
    const a = Number(element.air || 0);
    const w = Number(element.water || 0);
    const ca = Number(modality.cardinal || 0);
    const fi = Number(modality.fixed || 0);
    const mu = Number(modality.mutable || 0);
    return `要素: 火${f} 地${e} 風${a} 水${w}｜区分: 活${ca} 不${fi} 柔${mu}`;
  }

  let distShort =
    typeof buildDistLinesFromcounts === "function" && typeof buildNowModernPlanetCounts === "function"
      ? (buildDistLinesFromcounts(buildNowModernPlanetCounts(story), { forX: false }) || buildDistShortFallback())
      : buildDistShortFallback();
  if (typeof distShort === "string") {
    distShort = distShort.replace("｜区分:", "\n区分:");
  }

  const closeLines = typeof pickCloseLines === "function"
    ? pickCloseLines(RENDER_COPY, story, { seedBase, pickStable })
    : [];

  const footerPool = Array.isArray(RENDER_COPY?.FOOTER_X_POOL) ? RENDER_COPY.FOOTER_X_POOL : [];
  const footer =
    (footerPool.length && typeof pickStable === "function"
      ? pickStable(footerPool, `${seedBase}|footer_x`)
      : "") ||
    String(RENDER_COPY?.FOOTER_X || "星は語る。🌎🛸").trim();
  const closeArr = (Array.isArray(closeLines) ? closeLines : [String(closeLines || "")])
    .map((l) => String(l || "").trim())
    .filter(Boolean)
    .filter((l) => l !== footer);

  const MAX = 270;

  function pickRecommendedSign() {
    const counts = {};
    const list = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    list.forEach((r) => {
      const a = r?.a_sign_ja || (r?.a && typeof publicSignJa === "function" ? publicSignJa(story, r.a) : "");
      const b = r?.b_sign_ja || (r?.b && typeof publicSignJa === "function" ? publicSignJa(story, r.b) : "");
      [a, b].filter(Boolean).forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
    });
    const sorted = Object.keys(counts).sort((x, y) => (counts[y] || 0) - (counts[x] || 0));
    return sorted[0] || moonSignJa || "";
  }

  const recSign = pickRecommendedSign();
  const hashTags = ["#ソラのこえ"];
  if (moonSignJa) hashTags.push(`#${moonSignJa}`);
  if (recSign) hashTags.push(`#${recSign}`);
  const hashLine = Array.from(new Set(hashTags)).join(" ");

  function pickYoinHead(yoinText) {
    const raw = String(yoinText || "").trim();
    if (!raw) return "";
    const firstLine = raw.split("\n")[0] || "";
    const m = firstLine.match(/^(.{1,80}?。)/);
    return (m ? m[1] : firstLine).trim();
  }

  function buildYoinShortLine() {
    if (typeof buildYoinGlobal === "function" && RENDER_COPY?.YOIN_GLOBAL?.BUILD_SHORT) {
      const toneCounts = {};
      (story?.public?.sky_top || []).forEach((r) => {
        const k = aspectKey(r?.type || r?.aspectType || "");
        const t = aspectTone(k);
        toneCounts[t] = (toneCounts[t] || 0) + 1;
      });
      const toneKey = Object.keys(toneCounts).sort((a,b) => (toneCounts[b]||0) - (toneCounts[a]||0))[0] || "";
      const g = buildYoinGlobal(story, { kind: "public", compact: true, statsScope: "top" }) || {};
      const topElement = g.element || "mixed";
      const topModality = g.modality || "mixed";
      const s = RENDER_COPY.YOIN_GLOBAL.BUILD_SHORT({
        topElement,
        topModality,
        toneKey,
        seedBase: `${seedBase}|yoin_global`,
        pickStable,
      });
      const line = String(s || "").trim().replace(/^空層[:：]\s*/g, "");
      return line ? `【空層】${line}` : "";
    }
    return "";
  }

  function build({ keepSecond, keepYoin, keepClose, keepDist, keepHash }) {
    const lines = [];
    lines.push(`🌌 ${dateLabel}｜空の配置`);
    lines.push("");

    if (moonSignJa) lines.push(`🌙月：${moonSignJa}`);
    lines.push("");

    if (main1) lines.push(main1);
    if (keepSecond && main2) {
      lines.push("");
      lines.push(main2);
    }

    if (keepDist && distShort) {
      lines.push("");
      lines.push(distShort);
    }

    if (keepYoin) {
      lines.push("");
      const yoinLine = buildYoinShortLine() || pickYoinHead(yoin);
      if (yoinLine) lines.push(yoinLine);
    }

    if (keepClose && closeArr.length) {
      lines.push("");
      lines.push(...closeArr);
    }

    lines.push("");
    lines.push(footer);

    if (keepHash && hashLine) {
      lines.push("");
      lines.push(hashLine);
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const variants = [
    { keepSecond: true, keepYoin: true, keepClose: false, keepDist: true, keepHash: true },
    { keepSecond: false, keepYoin: true, keepClose: false, keepDist: true, keepHash: true },
    { keepSecond: false, keepYoin: false, keepClose: false, keepDist: true, keepHash: true },
    { keepSecond: false, keepYoin: false, keepClose: false, keepDist: true, keepHash: false },
  ];

  let text = "";
  for (const v of variants) {
    text = build(v);
    if (text.length <= MAX) break;
  }
  if (text.length > MAX) text = text.slice(0, MAX - 1) + "…";
  return text;
}

module.exports = { renderX };
