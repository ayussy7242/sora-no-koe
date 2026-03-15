"use strict";

const path = require("path");
const { renderInstagramCarousel, formatDateLabel } = require("../../engine/channels/ig/ig_carousel");
const { pickObservationLine, renderIGCaption } = require("../../presenters/format/ig_caption");
const { buildMoonStatus, formatMoonEventDisplay } = require("../../domain/moon_info");
const { selectNextMajorPhase } = require("../../domain/moon_phase");
const { toDateLocalJST } = require("../../utils/time_utils");
const { generateIgObservationText } = require("../../usecases/channels/ig/ig_observation_ai");
const { generateIgResonanceText } = require("../../usecases/channels/ig/ig_resonance_ai");
const { generateIgTsukijiStructureText } = require("../../usecases/channels/ig/ig_tsukiji_structure_ai");
const { generateIgSkyOverviewText } = require("../../usecases/channels/ig/ig_sky_overview_ai");
const { generateIgMoonText } = require("../../usecases/channels/ig/ig_moon_ai");
const {
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  waitForContainer,
} = require("../../integrations/ig/ig_graph");

function ensureIgOutputs(story) {
  story.outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  story.outputs.ig = story.outputs.ig && typeof story.outputs.ig === "object" ? story.outputs.ig : {};
  story.outputs.ig.source = story.outputs.ig.source && typeof story.outputs.ig.source === "object" ? story.outputs.ig.source : {};
  story.outputs.ig.parts = story.outputs.ig.parts && typeof story.outputs.ig.parts === "object" ? story.outputs.ig.parts : {};
  story.outputs.ig.rendered = story.outputs.ig.rendered && typeof story.outputs.ig.rendered === "object" ? story.outputs.ig.rendered : {};
  story.outputs.ig.rendered.carousel = story.outputs.ig.rendered.carousel && typeof story.outputs.ig.rendered.carousel === "object"
    ? story.outputs.ig.rendered.carousel
    : {};
  return story.outputs.ig;
}

async function maybeGenerateIgOutputs({ story, dict, env, asOfISO, useAi }) {
  if (!useAi) return story;
  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return story;

  const igOut = ensureIgOutputs(story);
  const openai = {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
  };

  if (!igOut.parts.observation) {
    const obs = await generateIgObservationText({ story, dict, openai });
    if (obs?.ok && obs.text) {
      igOut.parts.observation = obs.text;
      igOut.rendered.carousel.slide1_observation = obs.text;
    }
  }

  if (!igOut.parts.moon) {
    const moon = await generateIgMoonText({ story, dict, openai, asOfISO });
    if (moon?.ok && moon.text) {
      igOut.parts.moon = moon.text;
      igOut.rendered.carousel.slide2_text = moon.text;
    }
  }

  if (!igOut.parts.resonance) {
    const res = await generateIgResonanceText({ story, dict, openai });
    if (res?.ok && res.text) {
      igOut.parts.resonance = res.text;
      igOut.rendered.carousel.slide3_text = res.text;
    }
  }

  if (!igOut.parts.tsukiji_structure) {
    const ts = await generateIgTsukijiStructureText({ story, dict, openai });
    if (ts?.ok && ts.text) {
      igOut.parts.tsukiji_structure = ts.text;
      igOut.rendered.carousel.slide4_structure = ts.text;
    }
  }

  if (!igOut.parts.sky_overview) {
    const sky = await generateIgSkyOverviewText({ story, dict, openai });
    if (sky?.ok && sky.text) {
      igOut.parts.sky_overview = sky.text;
      igOut.sky_overview_text = sky.text;
    }
  }

  return story;
}

function planetLine({ glyph, name, sign }) {
  if (!glyph && !name) return "";
  const signPart = sign ? `（${sign}）` : "";
  return `${glyph || ""} ${name || ""}${signPart}`.trim();
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

function buildMoonSlide({ story, dateLabel, dateLocal, dict }) {
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

function buildCarouselSlides({ story, dateLocal, withCta, dict }) {
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
    north_node: { name: "ドラゴンヘッド", glyph: "☊" },
    south_node: { name: "ドラゴンテイル", glyph: "☋" },
  };

  const aKey = topAspect?.a || "moon";
  const bKey = topAspect?.b || "lilith";
  const aMeta = planetMap[aKey] || { name: aKey, glyph: "" };
  const bMeta = planetMap[bKey] || { name: bKey, glyph: "" };

  const aSign = story?.public?.transit_signs?.[aKey]?.sign_ja || "乙女座";
  const bSign = story?.public?.transit_signs?.[bKey]?.sign_ja || "射手座";

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
    lineA: planetLine({ glyph: aMeta.glyph, name: aMeta.name, sign: aSign }),
    lineB: planetLine({ glyph: bMeta.glyph, name: bMeta.name, sign: bSign }),
    aspectLine,
    structure: resonanceText,
    bodyAKey: aKey,
    bodyBKey: bKey,
  };

  const slideMoon = buildMoonSlide({ story, dateLabel, dateLocal, dict });

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

async function uploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  buffers,
  expiresDays = 7,
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!Array.isArray(buffers) || buffers.length === 0) throw new Error("buffers missing");

  const bucket = storage.bucket(bucketName);
  const urls = [];
  const paths = [];
  const expiresMs = Math.max(1, Number(expiresDays) || 7) * 24 * 60 * 60 * 1000;

  for (let i = 0; i < buffers.length; i++) {
    const index = i + 1;
    const relPath = path.posix.join("ig", "carousel", String(dateLocal), `slide-${index}.png`);
    const file = bucket.file(relPath);
    await file.save(buffers[i], {
      contentType: "image/png",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });
    urls.push(url);
    paths.push(relPath);
  }

  return { ok: true, urls, paths, bucket: bucketName };
}

async function runIgPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const dict = deps?.dict || require("../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");

  const accessToken = env2.IG_ACCESS_TOKEN;
  const igUserId = env2.IG_USER_ID;
  const graphVersion = env2.IG_GRAPH_VERSION || "v19.0";
  if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
  if (!igUserId) throw new Error("IG_USER_ID missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const useAi = opts.useAi !== false;
  const withCta = opts.withCta !== false;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;

  let story = await storyService.buildStoryForUser({
    appUserId: "public",
    dateLocal,
    asOfISO,
    mode: "public",
  });

  story = await maybeGenerateIgOutputs({ story, dict, env: env2, asOfISO, useAi });

  const carousel = buildCarouselSlides({ story, dateLocal, withCta, dict });
  const buffers = await renderInstagramCarousel(carousel);

  const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
  const upload = await uploadCarouselSlides({
    storage,
    bucketName,
    dateLocal,
    buffers,
    expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
  });

  const caption = renderIGCaption(story);

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      date_local: dateLocal,
      as_of: asOfISO,
      caption,
      image_urls: upload.urls,
      gcs_paths: upload.paths,
    };
  }

  const childIds = [];
  for (const imageUrl of upload.urls) {
    const created = await createImageContainer({
      igUserId,
      imageUrl,
      accessToken,
      version: graphVersion,
    });
    const childId = created?.id;
    if (!childId) throw new Error("child container id missing");
    const wait = await waitForContainer({ creationId: childId, accessToken, version: graphVersion });
    if (!wait.ok) throw new Error(`child container not ready: ${childId}`);
    childIds.push(childId);
  }

  const carouselContainer = await createCarouselContainer({
    igUserId,
    children: childIds,
    caption,
    accessToken,
    version: graphVersion,
  });
  const creationId = carouselContainer?.id;
  if (!creationId) throw new Error("carousel container id missing");

  const waitCarousel = await waitForContainer({ creationId, accessToken, version: graphVersion });
  if (!waitCarousel.ok) throw new Error(`carousel container not ready: ${creationId}`);

  const published = await publishMedia({
    igUserId,
    creationId,
    accessToken,
    version: graphVersion,
  });

  return {
    ok: true,
    date_local: dateLocal,
    as_of: asOfISO,
    caption,
    image_urls: upload.urls,
    gcs_paths: upload.paths,
    carousel_container_id: creationId,
    media_id: published?.id || null,
    child_container_ids: childIds,
  };
}

module.exports = { runIgPost };
