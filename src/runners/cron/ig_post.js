"use strict";

const path = require("path");
const { renderInstagramCarousel, formatDateLabel } = require("../../engine/channels/ig/ig_carousel");
const { pickObservationLine, renderIGCaption } = require("../../presenters/format/ig_caption");
const { aspectInfo } = require("../../presenters/format/format/line_common");
const { buildMoonStatus, formatMoonEventDisplay } = require("../../domain/moon_info");
const { selectNextMajorPhase } = require("../../domain/moon_phase");
const { toDateLocalJST } = require("../../utils/time_utils");
const { generateIgObservationText } = require("../../usecases/channels/ig/ig_observation_ai");
const { generateIgResonanceText } = require("../../usecases/channels/ig/ig_resonance_ai");
const { generateIgTsukijiStructureText } = require("../../usecases/channels/ig/ig_tsukiji_structure_ai");
const { generateIgSkyOverviewText } = require("../../usecases/channels/ig/ig_sky_overview_ai");
const { generateIgMoonText } = require("../../usecases/channels/ig/ig_moon_ai");
const {
  generateIgCarouselCaptionText,
  generateIgCarouselObservationText,
} = require("../../usecases/channels/ig/ig_carousel_caption_ai");
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

function buildAspectKey(aspect, { includeOrb = false } = {}) {
  if (!aspect) return "";
  const a = String(aspect?.a || "").toLowerCase();
  const b = String(aspect?.b || "").toLowerCase();
  const deg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : "";
  const orb = includeOrb && Number.isFinite(Number(aspect?.orb_deg))
    ? Number(aspect.orb_deg).toFixed(2)
    : "";
  return [a, b, deg, orb].filter(Boolean).join("|");
}

async function maybeGenerateIgOutputs({ story, dict, env, asOfISO, useAi, forceAi }) {
  if (!useAi) return story;
  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return story;

  const igOut = ensureIgOutputs(story);
  const openai = {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
  };

  if (forceAi || !igOut.parts.observation) {
    const obs = await generateIgObservationText({ story, dict, openai });
    if (obs?.ok && obs.text) {
      igOut.parts.observation = obs.text;
      igOut.rendered.carousel.slide1_observation = obs.text;
    }
  }

  if (forceAi || !igOut.parts.moon) {
    const moon = await generateIgMoonText({ story, dict, openai, asOfISO });
    if (moon?.ok && moon.text) {
      igOut.parts.moon = moon.text;
      igOut.rendered.carousel.slide2_text = moon.text;
    }
  }

  const currentResonanceKey = igOut.source?.resonance_aspect_key || "";
  const usedResonanceKey = igOut.source?.resonance_aspect_key_used || "";
  const needsResonance =
    forceAi ||
    !igOut.parts.resonance ||
    !usedResonanceKey ||
    (currentResonanceKey && currentResonanceKey !== usedResonanceKey);

  if (needsResonance) {
    const res = await generateIgResonanceText({ story, dict, openai });
    if (res?.ok && res.text) {
      igOut.parts.resonance = res.text;
      igOut.rendered.carousel.slide3_text = res.text;
      igOut.source.resonance_aspect_key_used = currentResonanceKey || "";
      igOut.source.resonance_aspect_used = igOut.source?.resonance_aspect || null;
    }
  }

  if (forceAi || !igOut.parts.tsukiji_structure) {
    const ts = await generateIgTsukijiStructureText({ story, dict, openai });
    if (ts?.ok && ts.text) {
      igOut.parts.tsukiji_structure = ts.text;
      igOut.rendered.carousel.slide4_structure = ts.text;
    }
  }

  if (forceAi || !igOut.parts.sky_overview) {
    const sky = await generateIgSkyOverviewText({ story, dict, openai });
    if (sky?.ok && sky.text) {
      igOut.parts.sky_overview = sky.text;
      igOut.sky_overview_text = sky.text;
    }
  }

  if (forceAi || !igOut.parts.caption_center) {
    const cap = await generateIgCarouselCaptionText({ story, dict, openai, asOfISO });
    if (cap?.ok && cap.text) {
      igOut.parts.caption_center = cap.text;
    }
  }

  if (forceAi || !igOut.parts.caption_observation) {
    const obs = await generateIgCarouselObservationText({ story, dict, openai });
    if (obs?.ok && obs.text) {
      igOut.parts.caption_observation = obs.text;
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

function plainMoonSymbol(kind) {
  if (kind === "new") return "●";
  if (kind === "full") return "○";
  return "◑";
}

function pickPreferredResonanceAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const coreBodies = new Set([
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ]);

  const withinOne = pool
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((r) => Number.isFinite(r.orb) && r.orb <= 1.0);

  const coreHits = withinOne.filter(({ row }) => coreBodies.has(row?.a) && coreBodies.has(row?.b));
  if (coreHits.length) {
    coreHits.sort((a, b) => a.orb - b.orb);
    return coreHits[0].row;
  }

  const outerBodies = new Set(["lilith", "chiron"]);
  const outerHits = withinOne.filter(({ row }) => outerBodies.has(row?.a) || outerBodies.has(row?.b));
  if (outerHits.length) {
    outerHits.sort((a, b) => a.orb - b.orb);
    return outerHits[0].row;
  }

  return skyTop[0] || skyAll[0] || null;
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
  const nextSymbol = next ? plainMoonSymbol(next.kind) : "";
  const nextPhaseLabel = nextDisplay?.label || "";
  const nextMoonName = "";
  const nextDate = nextDisplay?.dateLabel || "";

  const observation =
    parts.moon ||
    renderedCarousel.slide2_text ||
    igOut.moon_text ||
    (phaseLabelBase || moonSign
      ? `${moonSign || "—"}の月が空にあり、${phaseLabelBase || "静かな月相"}の空気が広がります。`
      : "");

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

  const topAspect =
    story?.outputs?.ig?.source?.resonance_aspect ||
    story?.public?.sky_top?.[0] ||
    story?.public?.sky_all?.[0] ||
    null;
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

  const { aspectLine, deepLine } = (() => {
    if (!topAspect) return { aspectLine: "スクエア 90°　orb 0.30°", deepLine: "" };
    const info = aspectInfo(dict, topAspect.type || topAspect.aspect, topAspect.aspect_deg);
    const label = info?.label_ja || aspectLabelJa(topAspect.type, topAspect.aspect_deg);
    const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(topAspect.aspect_deg);
    const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
    const head = label && label.includes("°") ? label : [label, degLabel].filter(Boolean).join(" ");
    const orbLabel = Number.isFinite(Number(topAspect.orb_deg)) ? `orb ${Number(topAspect.orb_deg).toFixed(2)}°` : "";
    const line = [head, orbLabel].filter(Boolean).join("　").trim();

    if (info?.group && info.group !== "major") {
      return {
        aspectLine: "深層角度",
        deepLine: line,
      };
    }
    return { aspectLine: line, deepLine: "" };
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
    deepLine,
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

  const igOut = ensureIgOutputs(story);
  const preferredAspect = pickPreferredResonanceAspect(story);
  if (preferredAspect) {
    igOut.source.resonance_aspect = preferredAspect;
    igOut.source.resonance_aspect_key = buildAspectKey(preferredAspect, { includeOrb: true });
  } else {
    igOut.source.resonance_aspect_key = "";
  }

  story = await maybeGenerateIgOutputs({ story, dict, env: env2, asOfISO, useAi, forceAi: opts.forceAi });

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
      resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
      resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
      resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
      slide3_display_aspect: topAspect || null,
      ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
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
    resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
    resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
    resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
    slide3_display_aspect: topAspect || null,
    ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
    caption,
    image_urls: upload.urls,
    gcs_paths: upload.paths,
    carousel_container_id: creationId,
    media_id: published?.id || null,
    child_container_ids: childIds,
  };
}

module.exports = { runIgPost };
