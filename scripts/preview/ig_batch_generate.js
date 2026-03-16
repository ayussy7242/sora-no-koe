#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  renderInstagramCarousel,
  formatDateLabel,
} = require("../../src/engine/channels/ig/ig_carousel");
const dict = require("../../src/content/dict");
const { buildTsukijiRowsPublic, buildKinjitsuRowsPublic, buildTsukijiThemeLine } = require("../../src/domain/tsukiji_public");
const {
  buildMoonStatus,
  formatMoonEventDisplay,
} = require("../../src/domain/moon_info");
const { selectNextMajorPhase } = require("../../src/domain/moon_phase");
const { pickObservationLine } = require("../../src/presenters/format/ig_caption");
const { aspectInfo } = require("../../src/presenters/format/format/line_common");
const { generateIgObservationText } = require("../../src/usecases/channels/ig/ig_observation_ai");
const { generateIgResonanceText } = require("../../src/usecases/channels/ig/ig_resonance_ai");
const { generateIgTsukijiStructureText } = require("../../src/usecases/channels/ig/ig_tsukiji_structure_ai");
const { generateIgMoonText } = require("../../src/usecases/channels/ig/ig_moon_ai");

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

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  return new Date(`${s}T00:00:00Z`);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, days) {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function unwrapStory(payload) {
  if (payload && typeof payload === "object" && payload.story) return payload.story;
  return payload;
}

function mergeStoryPayload(payload, story) {
  if (payload && typeof payload === "object" && payload.story) {
    payload.story = story;
    return payload;
  }
  return story;
}

async function fetchStory({ base, date, outputs, igAi }) {
  const url = new URL("/stories", base);
  url.searchParams.set("date_local", date);
  url.searchParams.set("datetime_local", `${date}T12:00:00`);
  url.searchParams.set("format", "json");
  url.searchParams.set("outputs", outputs ? "1" : "0");
  url.searchParams.set("ig_ai", igAi ? "1" : "0");
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetch failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return res.json();
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

function aspectLabelJa(type, deg) {
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
}

function pickPreferredResonanceAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const coreBodies = new Set([
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ]);
  const outerBodies = new Set(["lilith", "chiron"]);
  const withinOne = pool
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((r) => Number.isFinite(r.orb) && r.orb <= 1.0);

  const coreHits = withinOne.filter(({ row }) => coreBodies.has(row?.a) && coreBodies.has(row?.b));
  if (coreHits.length) {
    coreHits.sort((a, b) => a.orb - b.orb);
    return coreHits[0].row;
  }

  const outerHits = withinOne.filter(({ row }) => outerBodies.has(row?.a) || outerBodies.has(row?.b));
  if (outerHits.length) {
    outerHits.sort((a, b) => a.orb - b.orb);
    return outerHits[0].row;
  }

  return skyTop[0] || skyAll[0] || null;
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

function buildSlides({ story, dateLocal, withCta }) {
  const dateLabel = formatDateLabel(dateLocal);
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};

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
    }) || "天体が全体に散る配置";

  const slide1 = {
    dateLabel,
    brand: "ソラのこえ",
    tagline: "今日の星の配置",
    sunLine: `☉ ${sunSign}`,
    moonLine: `☽ ${moonSign}`,
    observation,
    swipeLabel: "Swipe →",
  };

  const topAspect = pickPreferredResonanceAspect(story);
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
    north_node: { name: "ドラゴンヘッド", glyph: "☊" },
    south_node: { name: "ドラゴンテイル", glyph: "☋" },
  };

  const aKey = topAspect?.a || "moon";
  const bKey = topAspect?.b || "lilith";
  const aMeta = planetMap[aKey] || { name: aKey, glyph: "" };
  const bMeta = planetMap[bKey] || { name: bKey, glyph: "" };

  const aSign = story?.public?.transit_signs?.[aKey]?.sign_ja || "乙女座";
  const bSign = story?.public?.transit_signs?.[bKey]?.sign_ja || "射手座";

  const aspectLine = (() => {
    if (!topAspect) return "スクエア 90°　orb 0.30°";
    const info = aspectInfo(dict, topAspect.type || topAspect.aspect, topAspect.aspect_deg);
    const label = info?.label_ja || aspectLabelJa(topAspect.type, topAspect.aspect_deg);
    const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(topAspect.aspect_deg);
    const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
    const head = label && label.includes("°") ? label : [label, degLabel].filter(Boolean).join(" ");
    return `${head}　orb ${Number(topAspect.orb_deg || 0).toFixed(2)}°`.trim();
  })();

  const resonanceText =
    parts.resonance ||
    renderedCarousel.slide3_text ||
    igOut.resonance_text ||
    "感情の整理と、日常に収まりきらない要素がぶつかる角度です。\n乙女座と射手座のあいだで、細部と遠さが同時に立ち上がります。";

  const slide3 = {
    dateLabel,
    header: "今日の共鳴",
    lineA: planetLine({ glyph: aMeta.glyph, name: aMeta.name, sign: aSign }),
    lineB: planetLine({ glyph: bMeta.glyph, name: bMeta.name, sign: bSign }),
    aspectLine,
    structure: resonanceText,
    bodyAKey: aKey,
    bodyBKey: bKey,
  };
  const slideMoon = buildMoonSlide({ story, dateLabel, dateLocal });

  const slide5 = {
    ornament: "☉        ☽",
    cta: "毎朝の空",
    sub: "今日の配置を\nLINEで配信中",
    brand: "sora-no-koe",
    dateLabel,
  };

  return {
    slides: [
      { kind: "cover", data: slide1 },
      { kind: "moon", data: slideMoon },
      { kind: "chart", data: { story, dateLabel } },
      { kind: "resonance", data: slide3 },
      ...(withCta ? [{ kind: "cta", data: slide5 }] : []),
    ],
  };
}

async function maybeLocalAI({ story, useAi }) {
  if (!useAi) return story;
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return story;

  const withOutputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  withOutputs.ig = withOutputs.ig && typeof withOutputs.ig === "object" ? withOutputs.ig : {};

  if (!withOutputs.ig.observation_text) {
    const obs = await generateIgObservationText({ story, dict, openai: { apiKey } });
    if (obs?.ok) {
      withOutputs.ig.observation_text = obs.text;
      withOutputs.ig.carousel = withOutputs.ig.carousel || {};
      withOutputs.ig.carousel.slide1_observation = obs.text;
    }
  }

  if (!withOutputs.ig.moon_text) {
    const asOfISO = `${story?.meta?.date_local || story?.public?.date_local || ""}T12:00:00+09:00`;
    const moon = await generateIgMoonText({ story, dict, openai: { apiKey }, asOfISO });
    if (moon?.ok) {
      withOutputs.ig.moon_text = moon.text;
      withOutputs.ig.carousel = withOutputs.ig.carousel || {};
      withOutputs.ig.carousel.slide2_text = moon.text;
    }
  }

  if (!withOutputs.ig.resonance_text) {
    const res = await generateIgResonanceText({ story, dict, openai: { apiKey } });
    if (res?.ok) {
      withOutputs.ig.resonance_text = res.text;
      withOutputs.ig.carousel = withOutputs.ig.carousel || {};
      withOutputs.ig.carousel.slide3_text = res.text;
    }
  }

  if (!withOutputs.ig.tsukiji_structure_text) {
    const ts = await generateIgTsukijiStructureText({ story, dict, openai: { apiKey } });
    if (ts?.ok) {
      withOutputs.ig.tsukiji_structure_text = ts.text;
      withOutputs.ig.carousel = withOutputs.ig.carousel || {};
      withOutputs.ig.carousel.slide4_structure = ts.text;
    }
  }

  story.outputs = withOutputs;
  return story;
}

async function renderAndSave({ story, dateLocal, outDir, withCta }) {
  const slides = await renderInstagramCarousel(buildSlides({ story, dateLocal, withCta }));
  const dir = path.join(outDir, dateLocal);
  ensureDir(dir);
  slides.forEach((buf, i) => {
    const outPath = path.join(dir, `slide-${i + 1}.png`);
    fs.writeFileSync(outPath, buf);
  });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.base || "http://localhost:8787";
  const storiesDir = args.storiesDir || args.stories || "tmp/stories";
  const outDir = args.outDir || "tmp/ig/carousel";
  const withCta = args.withCta !== "false";
  const igAi = args.ig_ai === undefined ? true : ["1", "true", "yes", "on"].includes(String(args.ig_ai));
  const useAiLocal = ["1", "true", "yes", "on"].includes(String(args.ai_local || "false"));
  const overwrite = ["1", "true", "yes", "on"].includes(String(args.overwrite || "false"));
  const stepDays = Number(args.step || 1);

  const single = args.date || args.date_local || "";
  const from = args.from || args.start || "";
  const to = args.to || args.end || "";

  let dates = [];
  if (single) {
    const d = parseDate(single);
    if (!d) throw new Error("[ig_batch] invalid --date");
    dates = [formatDate(d)];
  } else {
    const dFrom = parseDate(from);
    const dTo = parseDate(to);
    if (!dFrom || !dTo) throw new Error("[ig_batch] --from/--to are required when --date is not set");
    for (let d = dFrom; d <= dTo; d = addDays(d, stepDays)) {
      dates.push(formatDate(d));
    }
  }

  ensureDir(storiesDir);
  ensureDir(outDir);

  for (const dateLocal of dates) {
    const storyPath = path.join(storiesDir, `${dateLocal}.json`);
    let payload = null;
    let story = null;
    if (!overwrite && fs.existsSync(storyPath)) {
      payload = JSON.parse(fs.readFileSync(storyPath, "utf8"));
    } else {
      payload = await fetchStory({ base, date: dateLocal, outputs: true, igAi });
    }

    story = unwrapStory(payload);
    story = await maybeLocalAI({ story, useAi: useAiLocal });
    const toSave = mergeStoryPayload(payload, story);
    fs.writeFileSync(storyPath, JSON.stringify(toSave, null, 2), "utf8");

    const out = await renderAndSave({ story, dateLocal, outDir, withCta });
    console.log(`[ig_batch] ${dateLocal} -> ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
