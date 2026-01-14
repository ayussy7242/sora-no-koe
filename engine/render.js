"use strict";

/**
 * render.js (STABLE / V1-source-of-truth) — Unified (v2026.01+ FINAL)
 * - dict の V1原本(ASPECTS_V1/PLANETS_V1/POINTS_V1/SIGNS_V1) を直接参照して描画
 * - 互換マップ(BODY_JA/POINT_JA/ASPECT_JA)は保険として残す
 * - 占い化しない（no prediction / no should / no good-bad）
 *
 * ✅ Updates (v2026.01 FINAL)
 * - ASPECTS_V1.deep_space を ASPECTS_META に統合（deepの label/core を出す）
 * - X / IG に sky_all 由来の「ひそかな配置」を混ぜる（毎日同じ問題を回避）
 * - X は 1本目を "center"、追加で "secret" を 1本だけ出せる（長さ爆発しない）
 * - IG は sky_top(最大3) + secret(最大1) の構成
 */

function createRenderers({ BODY_JA = {}, POINT_JA = {}, ASPECT_JA = {}, dict = null } = {}) {
  // --------------------
  // dict normalize (V1 preferred)
  // --------------------
  const ASPECTS_V1 = dict?.ASPECTS_V1 || null;
  const PLANETS_V1 = dict?.PLANETS_V1 || null;
  const POINTS_V1 = dict?.POINTS_V1 || null;
  const SIGNS_V1 = dict?.SIGNS_V1 || null;

  // optional: META inputs
  const ASPECTS_META_IN = dict?.ASPECTS_META || null;
  const PLANETS_META_IN = dict?.PLANETS_META || null;
  const POINTS_META_IN = dict?.POINTS_META || null;

  // COPY
  const { RENDER_COPY } = require("../copy");

  // --------------------
  // internal safe JA maps (in case dict is missing)
  // --------------------
  const SAFE_BODY_JA = {
    Sun: "太陽",
    Moon: "月",
    Mercury: "水星",
    Venus: "金星",
    Mars: "火星",
    Jupiter: "木星",
    Saturn: "土星",
    Uranus: "天王星",
    Neptune: "海王星",
    Pluto: "冥王星",
  };

  const SAFE_POINT_JA = {
    ASC: "ASC（アセンダント）",
    MC: "MC（天頂）",
    Vertex: "バーテックス",
  };

  // --------------------
  // meta builders (from V1)
  // --------------------
  function buildAspectsMetaFromV1() {
    const major = ASPECTS_V1?.major || {};
    const deep = ASPECTS_V1?.deep_space || {};
    const out = {};

    for (const [k, v] of Object.entries(major)) {
      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora: v?.sora || null,
        feel: Array.isArray(v?.feel) ? v.feel : [],
      };
    }

    // ✅ deep も追加（ここが重要）
    for (const [k, v] of Object.entries(deep)) {
      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora: v?.sora || null,
        feel: Array.isArray(v?.feel) ? v.feel : [],
      };
    }

    // guard（最低限）
    out.square ||= { label_ja: "スクエア", core: null, sora: null, feel: [] };
    out.trine ||= { label_ja: "トライン", core: null, sora: null, feel: [] };
    out.opposition ||= { label_ja: "オポジション", core: null, sora: null, feel: [] };
    out.conjunction ||= { label_ja: "コンジャンクション", core: null, sora: null, feel: [] };
    out.sextile ||= { label_ja: "セクスタイル", core: null, sora: null, feel: [] };

    return out;
  }

  function buildPlanetsMetaFromV1() {
    const bodies = PLANETS_V1?.bodies || {};
    const out = {};
    for (const [k, v] of Object.entries(bodies)) {
      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora_short: v?.sora_short || null,
        sora: v?.sora || null,
        field: v?.field || null,
      };
    }
    return out;
  }

  function buildPointsMetaFromV1() {
    const points = POINTS_V1?.points || {};
    const out = {};
    for (const [k, v] of Object.entries(points)) {
      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora_short: v?.sora_short || null,
        sora: v?.sora || null,
      };
    }
    return out;
  }

  // final metas
  const ASPECTS_META = ASPECTS_V1 ? buildAspectsMetaFromV1() : (ASPECTS_META_IN || {});
  const PLANETS_META = PLANETS_V1 ? buildPlanetsMetaFromV1() : (PLANETS_META_IN || {});
  const POINTS_META = POINTS_V1 ? buildPointsMetaFromV1() : (POINTS_META_IN || {});

  // --------------------
  // formatters
  // --------------------
  function fmtAspectJa(aspectType) {
    return ASPECTS_META?.[aspectType]?.label_ja || ASPECT_JA?.[aspectType] || aspectType;
  }

  function fmtBodyJa(bodyKey) {
    return (
      PLANETS_META?.[bodyKey]?.label_ja ||
      BODY_JA?.[bodyKey] ||
      SAFE_BODY_JA?.[bodyKey] ||
      bodyKey
    );
  }

  function fmtPointJa(pointKey) {
    return (
      POINTS_META?.[pointKey]?.label_ja ||
      POINT_JA?.[pointKey] ||
      SAFE_POINT_JA?.[pointKey] ||
      pointKey
    );
  }

  function fmtAnyJa(key) {
    const p = fmtPointJa(key);
    if (p && p !== key) return p;
    return fmtBodyJa(key);
  }

  function coreOf(key) {
    return PLANETS_META?.[key]?.core || POINTS_META?.[key]?.core || null;
  }

  function aspectCore(type) {
    return ASPECTS_META?.[type]?.core || null;
  }

  function fmtDeg(n) {
    if (n === null || n === undefined) return "";
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n);
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  // --------------------
  // sign helpers
  // --------------------
  function signMeta(signKey) {
    const raw = String(signKey || "");
    const lower = raw.toLowerCase();

    const byLower = SIGNS_V1?.signs?.[lower];
    if (byLower) return byLower;

    const byRaw = SIGNS_V1?.signs?.[raw];
    if (byRaw) return byRaw;

    const signs = SIGNS_V1?.signs;
    if (signs && typeof signs === "object") {
      const hitKey = Object.keys(signs).find((k) => String(k).toLowerCase() === lower);
      if (hitKey) return signs[hitKey];
    }
    return null;
  }

  function signJaFromIndex(signIndex) {
    const FALLBACK_SIGNS_JA = [
      "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
      "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"
    ];
    if (!Number.isFinite(signIndex) || signIndex < 0 || signIndex > 11) return null;

    if (SIGNS_V1?.signs) {
      const orderKeys = [
        "aries", "taurus", "gemini", "cancer", "leo", "virgo",
        "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
      ];
      const key = orderKeys[signIndex];
      const s = SIGNS_V1.signs?.[key];
      if (s?.label_ja) return s.label_ja;
    }
    return FALLBACK_SIGNS_JA[signIndex];
  }

  function mod360(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    return ((n % 360) + 360) % 360;
  }

  function getTransitLonFromStory(story, bodyKey) {
    return (
      story?.public?.transit?.bodies?.[bodyKey] ??
      story?.public?.transit?.bodies_deg?.[bodyKey] ??
      story?.public?.transit_longitudes?.[bodyKey] ??
      story?.public?.bodies?.[bodyKey] ??
      story?.public?.transit_bodies?.[bodyKey] ??
      null
    );
  }

  function publicSignJa(story, bodyKey) {
    const direct = story?.public?.transit_signs?.[bodyKey]?.sign_ja;
    if (direct) return direct;

    const lonRaw = getTransitLonFromStory(story, bodyKey);
    const lon = mod360(lonRaw);
    if (!Number.isFinite(lon)) return null;

    const signIndex = Math.floor(lon / 30);
    return signJaFromIndex(signIndex);
  }

  function signKeyFromIndex(signIndex) {
    const orderKeys = [
      "aries", "taurus", "gemini", "cancer", "leo", "virgo",
      "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
    ];
    if (!Number.isFinite(signIndex) || signIndex < 0 || signIndex > 11) return null;
    return orderKeys[signIndex];
  }

  function publicSignKey(story, bodyKey) {
    const direct =
      story?.public?.transit_signs?.[bodyKey]?.sign_key ||
      story?.public?.transit_signs?.[bodyKey]?.sign_en ||
      story?.public?.transit_signs?.[bodyKey]?.sign ||
      null;

    if (direct) return String(direct).toLowerCase();

    const lonRaw = getTransitLonFromStory(story, bodyKey);
    const lon = mod360(lonRaw);
    if (!Number.isFinite(lon)) return null;

    const signIndex = Math.floor(lon / 30);
    return signKeyFromIndex(signIndex);
  }

  // --------------------
  // seeded randomness (stable by date/user)
  // --------------------
  function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function pickStable(arr, seedStr) {
    if (!Array.isArray(arr) || !arr.length) return "";
    const idx = hash32(seedStr) % arr.length;
    return arr[idx];
  }

  // --------------------
  // scoring
  // --------------------
  function orbMaxFromStory(story, fallback = 6) {
    const v = Number(story?.meta?.rules?.orb_max_deg);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  function weightFromOrb(orb, orbMax) {
    const o = Number(orb);
    const m = Number(orbMax);
    if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return 0;
    const w = 1 - Math.min(Math.max(o, 0), m) / m;
    return Math.max(0.15, w);
  }

  // --------------------
  // meaning lines (non-predictive)
  // --------------------
  function oneLineMeaning({ aKey, bKey, aspectType }) {
    const aCore = coreOf(aKey);
    const bCore = coreOf(bKey);
    const ac = aspectCore(aspectType);

    const aLabel = fmtAnyJa(aKey);
    const bLabel = fmtAnyJa(bKey);

    const left = aCore ? `${aLabel}（${aCore}）` : aLabel;
    const right = bCore ? `${bLabel}（${bCore}）` : bLabel;

    if (ac) return RENDER_COPY.MEANING_WITH_ASPECT_CORE(left, right, ac);
    return RENDER_COPY.MEANING_NO_ASPECT_CORE(left, right);
  }

  // --------------------
  // seeded "no contact" line
  // --------------------
  function buildNoContactLine(story) {
    const moonKey = story?.public?.moon?.sign_key || null;
    const s = moonKey ? signMeta(moonKey) : null;

    const element = s?.element || null;
    const modality = s?.modality || null;
    const signJa = s?.label_ja || story?.public?.moon?.sign_ja || null;

    const dateLocal = story?.meta?.date_local || "";
    const userId = story?.personal?.user_id || "public";
    const seedBase = `${dateLocal}|${userId}|no_contact`;

    const pools = RENDER_COPY.NO_CONTACT;

    const aPool = pools.byElement[element] || pools.byElement.default;
    const a = pickStable(aPool, seedBase + "|a");

    const bPool = pools.byModality[modality] || pools.byModality.default;
    const b = pickStable(bPool, seedBase + "|b") || "";

    const head = pools.headMoonTaste(signJa);
    return pools.glue(head, a, b);
  }

  // --------------------
  // yoin v2 (global mix) — render.js は「計算だけ」
  // --------------------
  function buildYoinLine(story) {
    const sky =
      (Array.isArray(story?.public?.sky_all) && story.public.sky_all) ||
      (Array.isArray(story?.public?.sky_top) && story.public.sky_top) ||
      [];

    if (!sky.length) return buildNoContactLine(story);

    const orbMax = orbMaxFromStory(story, 6);

    const elementScore = { fire: 0, earth: 0, air: 0, water: 0 };
    const modalityScore = { cardinal: 0, fixed: 0, mutable: 0 };
    const aspectScore = {};

    const rows = sky.slice(0, 8);

    for (const r of rows) {
      const w = weightFromOrb(r?.orb_deg, orbMax);

      const t = r?.type;
      if (t) aspectScore[t] = (aspectScore[t] || 0) + w;

      const aKey = r?.a;
      const bKey = r?.b;

      if (aKey) {
        const sa = signMeta(publicSignKey(story, aKey));
        if (sa?.element) elementScore[sa.element] = (elementScore[sa.element] || 0) + w;
        if (sa?.modality) modalityScore[sa.modality] = (modalityScore[sa.modality] || 0) + w;
      }

      if (bKey) {
        const sb = signMeta(publicSignKey(story, bKey));
        if (sb?.element) elementScore[sb.element] = (elementScore[sb.element] || 0) + w;
        if (sb?.modality) modalityScore[sb.modality] = (modalityScore[sb.modality] || 0) + w;
      }
    }

    function pickTopKey(obj, fallback = null) {
      const entries = Object.entries(obj || {});
      if (!entries.length) return fallback;
      entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
      return entries[0]?.[0] || fallback;
    }

    const topElement = pickTopKey(elementScore, null);
    const topModality = pickTopKey(modalityScore, null);
    const topAspect = pickTopKey(aspectScore, null);

    const aspectLabel = topAspect ? fmtAspectJa(topAspect) : null;

    // aspect core は V1に無い場合もあるので「aspectCore() fallback」
    const aspectCoreText = topAspect
      ? (ASPECTS_V1?.major?.[topAspect]?.core || aspectCore(topAspect) || null)
      : null;

    // ✅ 文言生成は copy 側でやる
    const out = RENDER_COPY.YOIN?.BUILD
      ? RENDER_COPY.YOIN.BUILD({
        topElement,
        topModality,
        aspectLabel,
        aspectCoreText,
      })
      : null;

    // safety（copy未導入のときに落ちない）
    if (out && String(out).trim()) return String(out).trim();

    // fallback（最小限）
    return buildNoContactLine(story);
  }

  function buildMoonLine(story) {
    const moon = story?.public?.moon || {};
    const moonSignJa = moon?.sign_ja || null;
    const moonSignKey = moon?.sign_key || null;
    const s = moonSignKey ? signMeta(moonSignKey) : null;

    const hint = s?.core || s?.sora_short || s?.field || null;

    if (moonSignJa) return RENDER_COPY.MOON_LINE_OK(moonSignJa, hint);
    return RENDER_COPY.MOON_LINE_LOADING();
  }

  // --------------------
  // natal list formatter (LINE command: わたしのほし) — ASC/MC 必須
  // --------------------
  function lonToSignDegMin(lonDeg) {
    const x = Number(lonDeg);
    if (!Number.isFinite(x)) return null;

    const lon = ((x % 360) + 360) % 360;
    const signIndex = Math.floor(lon / 30);
    const within = lon - signIndex * 30;

    const deg = Math.floor(within);
    const min = Math.floor((within - deg) * 60 + 1e-9);

    const signJa = signJaFromIndex(signIndex) || "（不明）";
    const mm = String(min).padStart(2, "0");
    return `${signJa} ${deg}°${mm}’`;
  }

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
      angles?.ASC ?? angles?.asc ?? angles?.asc_deg ??
      d?.min?.ASC ?? d?.min?.asc ??
      d?.ASC ?? d?.asc ??
      null;

    let mc =
      angles?.MC ?? angles?.mc ?? angles?.mc_deg ??
      d?.min?.MC ?? d?.min?.mc ??
      d?.MC ?? d?.mc ??
      null;

    if (!Number.isFinite(Number(asc))) asc = d?.["1"] ?? d?.[1] ?? asc;
    if (!Number.isFinite(Number(mc))) mc = d?.["10"] ?? d?.[10] ?? mc;

    return { asc, mc };
  }

  function renderNatalListFromCache(natalCacheDoc) {
    const d = natalCacheDoc || {};

    const bodies =
      d?.min?.bodies ||
      d?.min?.natal_positions ||
      d?.natal_positions ||
      d?.positions ||
      null;

    if (!bodies || typeof bodies !== "object") return RENDER_COPY.NATAL_LIST.NOT_READY();

    const { asc, mc } = pickAnglesFromNatalCache(d);
    if (!Number.isFinite(Number(asc)) || !Number.isFinite(Number(mc))) return RENDER_COPY.NATAL_LIST.MISSING_ANGLES();

    const order = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
    const glyph = {
      Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
      Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
      ASC: "ASC", MC: "MC",
    };

    const lines = [];
    lines.push(`${glyph.ASC} ${fmtPointJa("ASC")}：${lonToSignDegMin(asc)}`);
    lines.push(`${glyph.MC}  ${fmtPointJa("MC")}：${lonToSignDegMin(mc)}`);
    lines.push("");

    for (const k of order) {
      const v = bodies[k];
      const str = lonToSignDegMin(v);
      if (!str) continue;
      const label = fmtBodyJa(k);
      lines.push(`${glyph[k]} ${label}：${str}`);
    }

    const note = RENDER_COPY.NATAL_LIST.NOTE();
    return [RENDER_COPY.HEAD_NATAL_LIST, "", ...lines, note].join("\n");
  }

  // --------------------
  // layers helpers
  // --------------------
  function getSkyLayers(story) {
    const layers = story?.personal?.sky_layers;
    if (!layers) return null;

    const theme = Array.isArray(layers.theme) ? layers.theme : [];
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden = Array.isArray(layers.hidden) ? layers.hidden : [];

    return { theme, touch, hidden };
  }

  function tpKey(tp) {
    if (!tp) return "";
    return `${tp.natal_body_or_point || ""}|${tp.transit_body || ""}|${tp.aspect || ""}`;
  }

  function formatPersonalTPLine(story, tp, labelPrefix = "") {
    if (!tp) return "";

    const aKey = tp.natal_body_or_point;
    const bKey = tp.transit_body;

    const aJa = fmtAnyJa(aKey);
    const bJa = fmtAnyJa(bKey);

    const aSign = tp.natal_sign_ja ? `（${tp.natal_sign_ja}）` : "";
    const bSign = tp.transit_sign_ja ? `（${tp.transit_sign_ja}）` : "";

    const aspJa = fmtAspectJa(tp.aspect);
    const deg = fmtDeg(tp.aspect_deg);
    const orb = fmtDeg(tp.orb_deg);

    const { LABELS } = RENDER_COPY;

    const title =
      `${labelPrefix}` +
      `${LABELS?.NATAL || "ネイタル："}${aJa}${aSign} × ` +
      `${LABELS?.TRANSIT || "トランジット："}${bJa}${bSign}` +
      `｜${aspJa}（${deg}°｜orb ${orb}°）`;

    const mean = oneLineMeaning({ aKey, bKey, aspectType: tp.aspect });
    return `${title}\n${mean}`;
  }

  function skyKey(r) {
    if (!r) return "";
    return `${r.a || ""}|${r.b || ""}|${r.type || ""}`;
  }

  // ✅ public側の「ひそかな配置」(sky_allから、topに入ってない最小orb)
  function pickSecretPublicContact(story) {
    const top = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const all = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

    if (!all.length) return null;

    const used = new Set(top.slice(0, 3).map(skyKey));

    const candidates = all
      .filter((r) => !used.has(skyKey(r)))
      .filter((r) => Number.isFinite(Number(r?.orb_deg)))
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    return candidates[0] || null;
  }

  // ✅ public側の center（topが無い日も sky_all から拾えるように）
  function pickCenterPublicContact(story) {
    const top = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    if (top.length) return top[0] || null;

    const all = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    if (!all.length) return null;

    const sorted = all
      .filter((r) => Number.isFinite(Number(r?.orb_deg)))
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    return sorted[0] || null;
  }

  function formatPublicSkyLine(story, s, labelPrefix = "") {
    if (!s) return "";
    const aKey = s.a;
    const bKey = s.b;

    const aJa = fmtAnyJa(aKey);
    const bJa = fmtAnyJa(bKey);

    const aSignJa = s.a_sign_ja || publicSignJa(story, aKey);
    const bSignJa = s.b_sign_ja || publicSignJa(story, bKey);

    const aSign = aSignJa ? `（${aSignJa}）` : "";
    const bSign = bSignJa ? `（${bSignJa}）` : "";

    const aspJa = fmtAspectJa(s.type);
    const deg = fmtDeg(s.aspect_deg);
    const orb = fmtDeg(s.orb_deg);

    const title = `${labelPrefix}${aJa}${aSign} × ${bJa}${bSign}｜${aspJa}（${deg}°｜orb ${orb}°）`;
    const mean = oneLineMeaning({ aKey, bKey, aspectType: s.type });
    return `${title}\n${mean}`;
  }

  // --------------------
  // LINE v3 (Fixed structure)
  // --------------------
  function renderLine(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const layers = getSkyLayers(story);
    const hasPersonal = !!layers;

    const head = hasPersonal ? RENDER_COPY.HEAD_TODAY : RENDER_COPY.HEAD_SKY;
    const { HEAD_LAYERS, CIRCLES } = RENDER_COPY;

    const parts = [];
    const used = new Set();

    if (hasPersonal) {
      const theme0 = layers.theme?.[0] || null;
      const touch = Array.isArray(layers.touch) ? layers.touch : [];
      const hidden0 = layers.hidden?.[0] || null;

      // 今日の中心
      if (theme0) {
        used.add(tpKey(theme0));
        parts.push(`${HEAD_LAYERS.THEME}\n${formatPersonalTPLine(story, theme0, `${CIRCLES[0]} `)}`);
      }

      // 引っかかりやすい接点（最大2）
      if (touch[0]) {
        used.add(tpKey(touch[0]));
        parts.push(`${HEAD_LAYERS.TOUCH}\n${formatPersonalTPLine(story, touch[0], `${CIRCLES[1]} `)}`);
      }
      if (touch[1]) {
        used.add(tpKey(touch[1]));
        parts.push(`${formatPersonalTPLine(story, touch[1], `${CIRCLES[2]} `)}`);
      }

      // ひそやかな接点（重複除外）
      const hidden = hidden0 && !used.has(tpKey(hidden0)) ? hidden0 : null;
      if (hidden) {
        parts.push(`${HEAD_LAYERS.HIDDEN}\n${formatPersonalTPLine(story, hidden, "・")}`);
      }

      if (!parts.length) parts.push(buildNoContactLine(story));
    } else {
      const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];

      const center = skyTop?.[0] || pickCenterPublicContact(story);
      const t1 = skyTop?.[1] || null;
      const t2 = skyTop?.[2] || null;

      if (center) parts.push(`${HEAD_LAYERS.THEME}\n${formatPublicSkyLine(story, center, `${CIRCLES[0]} `)}`);
      if (t1) parts.push(`${HEAD_LAYERS.TOUCH}\n${formatPublicSkyLine(story, t1, `${CIRCLES[1]} `)}`);
      if (t2) parts.push(`${formatPublicSkyLine(story, t2, `${CIRCLES[2]} `)}`);

      const secret = pickSecretPublicContact(story);
      if (secret) parts.push(`${HEAD_LAYERS.HIDDEN}\n${formatPublicSkyLine(story, secret, "・")}`);

      if (!parts.length) parts.push(buildNoContactLine(story));
    }

    const moonLine = buildMoonLine(story);
    const yoin = buildYoinLine(story);

    return [
      RENDER_COPY.LINE_TITLE(dateLabel),
      "",
      head,
      "",
      parts.join("\n\n"),
      "",
      moonLine,
      "",
      RENDER_COPY.HEAD_YOIN,
      yoin,
      "",
      ...RENDER_COPY.FOOTER_LINE,
    ].join("\n");
  }

  // --------------------
  // X (copy-driven) — ✅ secret混ぜる版（renderは組み立てだけ）
  // --------------------
  function renderX(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSignJa = story?.public?.moon?.sign_ja || null;

    const center = pickCenterPublicContact(story);
    const yoin = buildYoinLine(story);

    if (!center) {
      // skyがない日は簡易
      return [
        `🌌 ${dateLabel}｜今日のソラ`,
        moonSignJa ? `月：${moonSignJa}` : "",
        "",
        buildNoContactLine(story),
        "",
        "解釈は、あなたのもの。🌎️🛸",
      ].filter(Boolean).join("\n");
    }

    // center
    const aLabel = fmtAnyJa(center.a);        // 例: 金星
    const bLabel = fmtAnyJa(center.b);        // 例: 土星
    const aSignJa = publicSignJa(story, center.a); // 例: 山羊座
    const bSignJa = publicSignJa(story, center.b); // 例: 魚座
    const aspectJa = fmtAspectJa(center.type);     // 例: セクスタイル
    const orb = Number(center.orb_deg);            // 例: 0.2

    // tone（いまの “空気” を短く一言）
    const aTone = signMeta(publicSignKey(story, center.a))?.tone || null;
    const bTone = signMeta(publicSignKey(story, center.b))?.tone || null;
    const tone = aTone || bTone || ""; // 例: 現実的に形にする

    const skyLine = RENDER_COPY.X_FORMAT.SKY_LINE({
      emoji: "☄️",
      aLabel,
      aSignJa,
      bLabel,
      bSignJa,
      aspectJa,
      orb,
    });

    // secret（任意）
    const secret = pickSecretPublicContact(story);
    let secretLine = "";
    if (secret) {
      secretLine = RENDER_COPY.X_FORMAT.SECRET_LINE({
        aLabel: fmtAnyJa(secret.a),
        aSignJa: publicSignJa(story, secret.a),
        bLabel: fmtAnyJa(secret.b),
        bSignJa: publicSignJa(story, secret.b),
        aspectJa: fmtAspectJa(secret.type),
        orb: Number(secret.orb_deg),
      });
    }

    return RENDER_COPY.X_FORMAT.BLOCK({
      dateLabel,
      moonSignJa,
      skyLine,
      tone,
      secretLine,
      yoin,
    });
  }



  // --------------------
  // IG (copy-driven) — ✅ secret 追加版
  // --------------------
  function renderIG(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSign = story?.public?.moon?.sign_ja || null;

    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

    // no sky
    if (!skyTop.length && !skyAll.length) {
      const lines = [];
      lines.push(RENDER_COPY.BRAND_IG ? `🌌 ${RENDER_COPY.BRAND_IG}` : "🌌 ソラのこえ。");
      lines.push(`[${dateLabel}｜今日のソラ]`);
      if (moonSign) lines.push(`月は ${moonSign} を通過中。`);
      lines.push("");
      lines.push(buildNoContactLine(story));
      lines.push("");
      lines.push(RENDER_COPY.FOOTER_IG);
      return lines.join("\n");
    }

    const lines = [];

    lines.push(RENDER_COPY.BRAND_IG ? `🌌 ${RENDER_COPY.BRAND_IG}` : "🌌 ソラのこえ。");
    lines.push(`[${dateLabel}｜今日のソラ]`);
    if (moonSign) lines.push(`月は ${moonSign} を通過中。`);
    lines.push("");

    const list = skyTop.length ? skyTop.slice(0, 3) : [pickCenterPublicContact(story)].filter(Boolean);

    list.forEach((s, idx) => {
      const aKey = s.a;
      const bKey = s.b;

      const aLabel = fmtBodyJa(aKey);
      const bLabel = fmtBodyJa(bKey);

      const aSignJa = publicSignJa(story, aKey);
      const bSignJa = publicSignJa(story, bKey);

      const aSign = aSignJa ? `（${aSignJa}）` : "";
      const bSign = bSignJa ? `（${bSignJa}）` : "";

      const aspectJa = fmtAspectJa(s.type);
      const orb = fmtDeg(s.orb_deg);

      lines.push(RENDER_COPY.IG_FORMAT.SKY_LINE_NUM(idx + 1, aLabel, aSign, bLabel, bSign));
      lines.push(RENDER_COPY.IG_FORMAT.SKY_LINE_ASPECT(aspectJa, orb));
      lines.push("");

      const aCore = coreOf(aKey) || "—";
      const bCore = coreOf(bKey) || "—";

      const aTone = signMeta(publicSignKey(story, aKey))?.tone || null;
      const bTone = signMeta(publicSignKey(story, bKey))?.tone || null;
      const tone = aTone || bTone || null;

      const aspectCoreText = aspectCore(s.type) || aspectJa;

      lines.push(
        RENDER_COPY.IG_FORMAT.MEANING_BLOCK({
          aLabel,
          aCore,
          bLabel,
          bCore,
          tone,
          aspectCoreText,
        })
      );
      lines.push("");
    });

    // ✅ secret（copyに寄せた）
    const secret = pickSecretPublicContact(story);
    if (secret) {
      const aKey = secret.a;
      const bKey = secret.b;

      const aLabel = fmtBodyJa(aKey);
      const bLabel = fmtBodyJa(bKey);

      const aSignJa = publicSignJa(story, aKey);
      const bSignJa = publicSignJa(story, bKey);

      const aSign = aSignJa ? `（${aSignJa}）` : "";
      const bSign = bSignJa ? `（${bSignJa}）` : "";

      const aspectJa = fmtAspectJa(secret.type);
      const orb = fmtDeg(secret.orb_deg);

      lines.push(RENDER_COPY.IG_FORMAT.SECRET_HEAD);
      lines.push(`${aLabel}${aSign} × ${bLabel}${bSign}`);
      lines.push(RENDER_COPY.IG_FORMAT.SKY_LINE_ASPECT(aspectJa, orb));
      lines.push("");
    }

    lines.push("");
    lines.push(RENDER_COPY.FOOTER_IG);
    return lines.join("\n");
  }


  return {
    renderLine,
    renderX,
    renderIG,
    fmtAspectJa,
    fmtBodyJa,
    fmtPointJa,
    renderNatalListFromCache,
  };
}

module.exports = { createRenderers };
