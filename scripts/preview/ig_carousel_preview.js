#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const dict = require("../../src/content/dict");
const { buildTsukijiRowsPublic, buildKinjitsuRowsPublic, buildTsukijiThemeLine } = require("../../src/domain/tsukiji_public");
const {
  buildMoonStatus,
  formatMoonEventDisplay,
} = require("../../src/domain/moon_info");
const { selectNextMajorPhase } = require("../../src/domain/moon_phase");
const {
  renderInstagramCarousel,
  formatDateLabel,
} = require("../../src/engine/renderers/instagram/carousel");
const { computeSpaceTheme } = require("../../src/engine/shared/space_background/theme");
const { pickObservationLine } = require("../../src/presenters/format/ig_caption");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../src/domain/astro_compute");
const { signGlyph } = require("../../src/presenters/shared/text/tokens");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function planetLine({ glyph, name, sign }) {
  if (!glyph && !name) return "";
  const signPart = sign ? `（${sign}）` : "";
  return `${glyph || ""} ${name || ""}${signPart}`.trim();
}

function formatIsoDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return d.replace(/-/g, ".");
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function buildMoonSlide({ story, dateLabel, dateLocal }) {
  const asOfISO = `${dateLocal}T12:00:00+09:00`;
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};
  const moonStatus = buildMoonStatus({ asOfISO, story, dict });
  const phaseLabelBase = String(moonStatus?.phaseLabel || "").trim();
  const moonSign = String(moonStatus?.signJa || "").trim();
  const phaseSymbol = moonStatus?.phaseSymbol || "🌙";

  const moonAgeLabel = Number.isFinite(Number(moonStatus?.moonAge))
    ? `月齢 ${Number(moonStatus.moonAge).toFixed(1)}`
    : "";
  const illuminationLabel = Number.isFinite(Number(moonStatus?.illumination))
    ? `照度 ${Math.round(Number(moonStatus.illumination) * 100)}%`
    : "";

  const phasePick = selectNextMajorPhase({ asOfISO, story, dict });
  const next = phasePick?.next || null;
  const nextDisplay = next ? formatMoonEventDisplay({ kind: next.kind, date: next.date, signJa: next.signJa, dict }) : null;
  const nextSymbol = nextDisplay?.phaseSymbol || "";
  const nextPhaseLabel = nextDisplay?.label || "";
  const nextMoonName = "";
  const nextDate = nextDisplay?.dateLabel || "";

  const observation =
    parts.moon ||
    renderedCarousel.slide2_text ||
    igOut.moon_text ||
    "";

  return {
    dateLabel,
    header: "今日の月",
    phaseSymbol,
    phaseLabel: phaseLabelBase || "—",
    moonSign: moonSign || "—",
    moonAgeLabel,
    illuminationLabel,
    observation,
    nextLabel: "次の月",
    nextSymbol,
    nextPhaseLabel,
    nextMoonName,
    nextDate,
    moonIllumination: Number.isFinite(Number(moonStatus?.illumination)) ? Number(moonStatus.illumination) : 0.5,
    moonWaxing: typeof phasePick?.waxing === "boolean"
      ? phasePick.waxing
      : Number.isFinite(Number(moonStatus?.moonAge))
        ? Number(moonStatus.moonAge) < 14.765
        : true,
    moonSize: 160,
  };
}

function pickLongRow({ story, resonance }) {
  const resKey = resonance ? [resonance.a, resonance.b].filter(Boolean).sort().join(":") : "";

  const longRows = buildTsukijiRowsPublic(story, story?.meta?.as_of || new Date().toISOString());
  const longPick = longRows.find((row) => {
    const rowKey = [row?.aKey, row?.bKey].filter(Boolean).sort().join(":");
    return !(resKey && rowKey && rowKey === resKey);
  });
  if (longPick) return { row: longPick, source: "tsukiji" };

  const kinjitsuRows = buildKinjitsuRowsPublic(story);
  const kinPick = kinjitsuRows.find((row) => {
    const rowKey = [row?.aKey, row?.bKey].filter(Boolean).sort().join(":");
    return !(resKey && rowKey && rowKey === resKey);
  });
  if (kinPick) return { row: kinPick, source: "kinjitsu" };

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = String(args.date || "2026-03-03");
  const storyPath = args.story || "tmp/stories/story.json";
  const outDir = args.outDir || path.join(process.cwd(), "tmp", "ig", "carousel", date);
  const withCta = args.withCta !== "false";
  const bgCache = ["1", "true", "yes", "on"].includes(String(args.bg_cache || args.bgCache || "false"));
  const bgRefresh = ["1", "true", "yes", "on"].includes(String(args.bg_refresh || args.bgRefresh || "false"));
  const bgCacheDir = args.bg_cache_dir || args.bgCacheDir || "tmp/ig/bg_cache";

  const storyRaw = fs.existsSync(storyPath) ? readJson(storyPath) : null;
  const story = unwrapStory(storyRaw);
  const dateLabel = formatDateLabel(date);
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};

  const paletteTheme = computeSpaceTheme({ story, dateLabel, variant: "slide1" });
  const paletteOut = {
    date,
    dateLabel,
    topElement: paletteTheme.topElement,
    secondaryElement: paletteTheme.secondaryElement,
    todayPalette: paletteTheme.todayPalette,
  };
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, "palette.json"), JSON.stringify(paletteOut, null, 2));

  const sunSign = story?.public?.transit_signs?.sun?.sign_ja || "魚座";
  const moonSign = story?.public?.transit_signs?.moon?.sign_ja || "乙女座";
  const observation =
    parts.observation ||
    renderedCarousel.slide1_observation ||
    igOut.observation_text ||
    pickObservationLine({
      dict,
      transitSigns: story?.public?.transit_signs || {},
      skyStrata: story?.public?.sky_strata || {},
      houseFocus: story?.public?.house_focus || {},
    }) || "水と火のあいだに重なりが見える配置";

  const slide1 = {
    dateLabel,
    brand: "ソラのこえ",
    tagline: "今日の星の配置",
    subLabel: "today's sky",
    sunLine: `☉ ${sunSign}`,
    moonLine: `☽ ${moonSign}`,
    observation,
    swipeLabel: "Swipe →",
  };

  const placements = (() => {
    const transit = story?.public?.transit_signs || {};
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const bodies = [
      { key: "sun", label: "太陽", glyph: "☉" },
      { key: "moon", label: "月", glyph: "☽" },
      { key: "mercury", label: "水星", glyph: "☿" },
      { key: "venus", label: "金星", glyph: "♀" },
      { key: "mars", label: "火星", glyph: "♂" },
      { key: "jupiter", label: "木星", glyph: "♃" },
      { key: "saturn", label: "土星", glyph: "♄" },
      { key: "uranus", label: "天王星", glyph: "♅" },
      { key: "neptune", label: "海王星", glyph: "♆" },
      { key: "pluto", label: "冥王星", glyph: "♇" },
      { key: "lilith", label: "リリス", glyph: "⚸" },
      { key: "chiron", label: "キロン", glyph: "⚷" },
    ];
    return bodies.map((body) => {
      const signKey = transit?.[body.key]?.sign_key || "";
      const signJa = transit?.[body.key]?.sign_ja || "—";
      const signIndex = signIndexFromKey(dict, signKey);
      const houseNo = Number.isFinite(signIndex) && Number.isFinite(ascIndex)
        ? houseNumberForSignIndex(signIndex, ascIndex)
        : null;
      const houseLabel = houseNo ? `${houseNo}H` : "—";
      return {
        glyph: body.glyph,
        label: body.label,
        signGlyph: signGlyph(signKey),
        sign: signJa,
        house: houseLabel,
      };
    });
  })();

  const slidePlacements = {
    dateLabel,
    header: "今日の配置",
    subLabel: "today's placements",
    lines: placements,
    brand: "sora-no-koe",
  };

  const slideMoon = { ...buildMoonSlide({ story, dateLabel, dateLocal: date }), subLabel: "today's moon" };

  const topAspect = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
  const planetMap = {
    sun: { name: "太陽", glyph: "☉" },
    moon: { name: "月", glyph: "☽" },
    mercury: { name: "水星", glyph: "☿" },
    venus: { name: "金星", glyph: "♀" },
    mars: { name: "火星", glyph: "♂" },
    jupiter: { name: "木星", glyph: "♃" },
    saturn: { name: "土星", glyph: "♄" },
    uranus: { name: "天王星", glyph: "♅" },
    neptune: { name: "海王星", glyph: "♆" },
    pluto: { name: "冥王星", glyph: "♇" },
    lilith: { name: "リリス", glyph: "⚸" },
    chiron: { name: "キロン", glyph: "⚷" },
  };

  const aKey = topAspect?.a || "moon";
  const bKey = topAspect?.b || "lilith";
  const aMeta = planetMap[aKey] || { name: aKey, glyph: "" };
  const bMeta = planetMap[bKey] || { name: bKey, glyph: "" };

  const aSign = story?.public?.transit_signs?.[aKey]?.sign_ja || "乙女座";
  const bSign = story?.public?.transit_signs?.[bKey]?.sign_ja || "射手座";

  const aspectLabelJa = (type, deg) => {
    const key = String(type || "").toLowerCase();
    const map = {
      conjunction: "コンジャンクション",
      conj: "コンジャンクション",
      opposition: "オポジション",
      opp: "オポジション",
      square: "スクエア",
      trine: "トライン",
      sextile: "セクスタイル",
      quincunx: "クインカンクス",
      inconjunct: "クインカンクス",
      quintile: "クインタイル",
      biquintile: "バイ・クインタイル",
      novile: "ノヴィル",
      septile: "セプタイル",
      semisextile: "セミセクスタイル",
      semisquare: "セミスクエア",
      sesquisquare: "セスキスクエア",
    };
    if (map[key]) return map[key];
    if (Number.isFinite(Number(deg))) return `${deg}°`;
    return String(type || "").toUpperCase();
  };

  const aspectLine = topAspect
    ? `${aspectLabelJa(topAspect.type, topAspect.aspect_deg)} ${topAspect.aspect_deg}°　orb ${Number(topAspect.orb_deg || 0).toFixed(2)}°`
    : "スクエア 90°　orb 0.30°";

  const resonanceText =
    parts.resonance ||
    renderedCarousel.slide3_text ||
    igOut.resonance_text ||
    "感情の整理と、日常に収まりきらない要素がぶつかる角度です。\n乙女座と射手座のあいだで、細部と遠さが同時に立ち上がります。";

  const slide3 = {
    dateLabel,
    header: "今日の共鳴",
    subLabel: "today's resonance",
    lineA: planetLine({ glyph: aMeta.glyph, name: aMeta.name, sign: aSign }),
    lineB: planetLine({ glyph: bMeta.glyph, name: bMeta.name, sign: bSign }),
    aspectLine,
    structure: resonanceText,
    bodyAKey: aKey,
    bodyBKey: bKey,
  };

  const slide5 = {
    ornament: "☉ ☽",
    cta: "今日の空",
    sub: "星の配置はLINEで配信中\nネイタル一覧も見れます",
    miniCta: "link in bio",
    brand: "sora-no-koe",
    dateLabel,
  };

  const slides = await renderInstagramCarousel({
    slides: [
      { kind: "slide1", data: slide1 },
      { kind: "slide2", data: slidePlacements },
      { kind: "slide3", data: { story, dateLabel, footerLabel: "sky chart", subLabel: "today's chart" } },
      ...(withCta ? [{ kind: "slide4", data: slide5 }] : []),
    ],
    slideSet: "morning",
    backgroundCache: bgCache ? { dir: bgCacheDir, force: bgRefresh } : null,
  });

  ensureDir(outDir);
  slides.forEach((buf, i) => {
    const index = i + 1;
    const outPath = path.join(outDir, `slide-${index}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`[ig] saved: ${outPath}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
