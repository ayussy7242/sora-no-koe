// src/render/render.js
"use strict";

/**
 * render.js (STABLE / V1-source-of-truth) — Unified v3.3 (v2026.01+)
 * - dict の V1原本(ASPECTS_V1/PLANETS_V1/POINTS_V1/SIGNS_V1) を直接参照して描画
 * - 互換マップ(BODY_JA/POINT_JA/ASPECT_JA)は保険として残す
 * - 占い化しない（no prediction / no should / no good-bad）
 *
 * ✅ v3.3
 * - buildYoinGlobal(): sky_all / personal layers から「地層の余韻（短文）」を生成（非予言）
 * - buildYoinLine(): 余韻（global短文 + center短文）を GLUE で合成
 * - LINE: 余韻(v3.3) + 残り香(seed) に加え、任意で「地層の余韻（詳細ブロック）」も出せる（copy側がHEAD_YOIN_GLOBALを持つ時だけ）
 */

function createRenderers({ BODY_JA = {}, POINT_JA = {}, ASPECT_JA = {}, dict = null } = {}) {
  // --------------------
  // dict normalize (V1 preferred)
  // --------------------
  const ASPECTS_V1 = dict?.ASPECTS_V1 || null;
  const PLANETS_V1 = dict?.PLANETS_V1 || null;
  const POINTS_V1 = dict?.POINTS_V1 || null;
  const SIGNS_V1 = dict?.SIGNS_V1 || null;

  // optional META inputs (fallback if V1 is missing)
  const ASPECTS_META_IN = dict?.ASPECTS_META || null;
  const PLANETS_META_IN = dict?.PLANETS_META || null;
  const POINTS_META_IN = dict?.POINTS_META || null;

  // COPY (source of truth for fixed wording)
  const { RENDER_COPY } = require("../copy/render");

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

    // deep も追加（ただし “非アスペクト”混入を防ぐ）
    for (const [k, v] of Object.entries(deep)) {
      if (!v || typeof v !== "object") continue;
      if (!("label_ja" in v) && !("core" in v)) continue;

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

  function signKeyFromIndex(signIndex) {
    const orderKeys = [
      "aries", "taurus", "gemini", "cancer", "leo", "virgo",
      "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
    ];
    if (!Number.isFinite(signIndex) || signIndex < 0 || signIndex > 11) return null;
    return orderKeys[signIndex];
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
    return `${tp.natal_body_or_point || ""}|${tp.transit_body || ""}|${tp.aspect || tp.type || ""}`;
  }

  function formatPersonalTPLine(story, tp, labelPrefix = "") {
    if (!tp) return "";

    const aKey = tp.natal_body_or_point;
    const bKey = tp.transit_body;

    const aJa = fmtAnyJa(aKey);
    const bJa = fmtAnyJa(bKey);

    const aSign = tp.natal_sign_ja ? `（${tp.natal_sign_ja}）` : "";
    const bSign = tp.transit_sign_ja ? `（${tp.transit_sign_ja}）` : "";

    const aspJa = fmtAspectJa(tp.aspect || tp.type);
    const deg = fmtDeg(tp.aspect_deg);
    const orb = fmtDeg(tp.orb_deg);

    const { LABELS } = RENDER_COPY;

    const title =
      `${labelPrefix}` +
      `${LABELS?.NATAL || "ネイタル："}${aJa}${aSign} × ` +
      `${LABELS?.TRANSIT || "トランジット："}${bJa}${bSign}` +
      `｜${aspJa}（${deg}°｜orb ${orb}°）`;

    const mean = oneLineMeaning({ aKey, bKey, aspectType: tp.aspect || tp.type });
    return `${title}\n${mean}`;
  }

  function skyKey(r) {
    if (!r) return "";
    return `${r.a || ""}|${r.b || ""}|${r.type || ""}`;
  }

  // --------------------
  // public pickers
  // --------------------
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
  // yoin helpers (global scoring)
  // --------------------
  function orbMaxFromStory(story, fallback = 6) {
    const orbMax = Number(story?.meta?.rules?.orb_max_deg);
    return Number.isFinite(orbMax) && orbMax > 0 ? orbMax : fallback;
  }

  function weightFromOrb(orb, orbMax) {
    const o = Number(orb);
    const m = Number(orbMax);
    if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return 0;

    // orbが小さいほど強い。最低ラインは0.15で床を作る（弱すぎるノイズを切る）
    const w = 1 - Math.min(Math.max(o, 0), m) / m;
    return Math.max(0.15, w);
  }

  // --------------------
  // yoin center — center-driven summary (short)
  // --------------------
  function buildYoinCenter(story) {
    const layers = getSkyLayers(story);
    const theme0 = layers?.theme?.[0] ?? null;
    const center = pickCenterPublicContact(story);

    let signKeyA = null;
    let signKeyB = null;
    let aspectType = null;

    if (theme0) {
      signKeyA = String(theme0.natal_sign_key || theme0.natal_sign_en || "").toLowerCase() || null;
      signKeyB = String(theme0.transit_sign_key || theme0.transit_sign_en || "").toLowerCase() || null;
      aspectType = theme0.aspect || theme0.type;
    } else if (center) {
      signKeyA = publicSignKey(story, center.a);
      signKeyB = publicSignKey(story, center.b);
      aspectType = center.type;
    } else {
      return buildNoContactLine(story);
    }

    const eA = signMeta(signKeyA)?.element || null;
    const eB = signMeta(signKeyB)?.element || null;
    const mA = signMeta(signKeyA)?.modality || null;
    const mB = signMeta(signKeyB)?.modality || null;

    const topElement = eA && eB ? (eA === eB ? eA : "mixed") : (eA || eB) || "mixed";
    const topModality = mA && mB ? (mA === mB ? mA : "mixed") : (mA || mB) || "mixed";

    const aspectCoreText =
      ASPECTS_V1?.major?.[aspectType]?.core ||
      ASPECTS_V1?.deep_space?.[aspectType]?.core ||
      aspectCore(aspectType) ||
      null;

    return RENDER_COPY.YOIN.BUILD({
      topElement,
      topModality,
      aspectLabel: aspectCoreText || null, // ✅ これ追加：余韻に“質感”が入る
    });
  }

  // --------------------
  // ✅ yoin global (short line) — layered / non-predictive
  // --------------------
  function buildYoinGlobal(story, opts = {}) {
    const {
      maxContacts = 10,
      minWeight = 0.12,
      includeDeep = true,
      compact = true,
    } = opts || {};

    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const userSeed =
      story?.personal?.user_id ||
      story?.meta?.app_user_id ||
      story?.meta?.appUserId ||
      "public";

    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}|yoin_global`;

    // 1) contacts（personal優先 / なければ public sky_all）
    const layers = getSkyLayers(story);
    let contacts = [];

    if (layers) {
      const allTp = []
        .concat(Array.isArray(layers.theme) ? layers.theme : [])
        .concat(Array.isArray(layers.touch) ? layers.touch : [])
        .concat(Array.isArray(layers.hidden) ? layers.hidden : [])
        .filter(Boolean);

      contacts = allTp.map((tp) => {
        const aKey = tp?.natal_body_or_point;
        const bKey = tp?.transit_body;
        const type = tp?.aspect || tp?.type;

        const aSignKey = String(tp?.natal_sign_key || tp?.natal_sign_en || "").toLowerCase() || null;
        const bSignKey = String(tp?.transit_sign_key || tp?.transit_sign_en || "").toLowerCase() || null;

        const orb = Number(tp?.orb_deg);
        return {
          kind: "personal",
          a: aKey,
          b: bKey,
          type,
          aSignKey,
          bSignKey,
          orb_deg: Number.isFinite(orb) ? orb : null,
        };
      });
    } else {
      const all = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
      contacts = all.map((r) => {
        const orb = Number(r?.orb_deg);
        return {
          kind: "public",
          a: r?.a,
          b: r?.b,
          type: r?.type,
          aSignKey: publicSignKey(story, r?.a),
          bSignKey: publicSignKey(story, r?.b),
          orb_deg: Number.isFinite(orb) ? orb : null,
        };
      });
    }

    if (!contacts.length) return "";

    // 2) score
    const OM = orbMaxFromStory(story, 6);

    const scored = contacts
      .map((c) => ({ ...c, w: weightFromOrb(c.orb_deg, OM) }))
      .filter((c) => c.w >= minWeight)
      .sort((a, b) => b.w - a.w);

    const top = scored.slice(0, maxContacts);
    if (!top.length) return "";

    // 3) element / modality distribution（重み和）
    const E = { fire: 0, earth: 0, air: 0, water: 0, mixed: 0, unknown: 0 };
    const M = { cardinal: 0, fixed: 0, mutable: 0, mixed: 0, unknown: 0 };

    function addSignKey(signKey, w) {
      const s = signMeta(signKey);
      const e = s?.element || "unknown";
      const m = s?.modality || "unknown";
      if (!(e in E)) E.unknown += w; else E[e] += w;
      if (!(m in M)) M.unknown += w; else M[m] += w;
    }

    for (const c of top) {
      if (c.aSignKey) addSignKey(c.aSignKey, c.w);
      if (c.bSignKey) addSignKey(c.bSignKey, c.w);
    }

    function topKey(obj) {
      const entries = Object.entries(obj).filter(([k, v]) => v > 0 && k !== "unknown");
      if (!entries.length) return null;
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
    }

    const topElement = topKey(E) || "mixed";
    const topModality = topKey(M) || "mixed";

    // 4) aspect core（重みが強い順で2つまで）
    const coreCandidates = [];
    for (const c of top) {
      const meta = ASPECTS_META?.[c.type] || null;
      const core = meta?.core || null;

      const isDeep = !!(ASPECTS_V1?.deep_space && ASPECTS_V1.deep_space[c.type]);
      if (isDeep && !includeDeep) continue;

      if (core) coreCandidates.push({ core, w: c.w, type: c.type });
    }
    coreCandidates.sort((a, b) => b.w - a.w);

    const core1 = coreCandidates[0]?.core || null;
    const core2 = coreCandidates[1]?.core || null;

    // 5) output（短文）
    if (typeof RENDER_COPY?.YOIN_GLOBAL?.BUILD_SHORT === "function") {
      return RENDER_COPY.YOIN_GLOBAL.BUILD_SHORT({
        topElement,
        topModality,
        core1,
        core2: compact ? null : core2,
        seedBase,
        pickStable,
      });
    }

    return "";
  }

  // --------------------
  // yoin line (v3.3) — GLOBAL(short) + CENTER(short)
  // --------------------
  function buildYoinLine(story) {
    const global = buildYoinGlobal(story, {
      maxContacts: 10,
      minWeight: 0.12,
      includeDeep: true,
      compact: true,
    });

    const center = buildYoinCenter(story);

    const glue = RENDER_COPY?.YOIN?.GLUE;
    if (typeof glue === "function") return glue(global, center);

    return [global, center].filter(Boolean).join(" ");
  }

  // --------------------
  // moon line
  // --------------------
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
  // natal list (LINE command: わたしのほし) — ASC/MC 必須
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
  // helpers (v3.3.3)
  // --------------------
  function _stripQualityPhrase(s) {
    // 「質感は ◯◯ 寄り。」の重複を消す（「」有無・空白揺れ・句読点揺れ対応）
    let out = String(s || "");

    // 1) 「質感は「◯◯」寄り。」
    out = out.replace(/[,、]?\s*質感は\s*「[^」]+」\s*寄り。?/g, "");

    // 2) 「質感は ◯◯ 寄り。」（カギカッコ無し）
    //    例: "、質感は チャンス・協力・選択肢 寄り。"
    out = out.replace(/[,、]?\s*質感は\s*[^。]+?\s*寄り。?/g, "");

    // 取り残しの読点/空白を掃除
    out = out.replace(/[,、]\s*。/g, "。");
    out = out.replace(/[,、]\s*$/g, "");
    out = out.replace(/\s{2,}/g, " ").trim();

    // 文末を「。」で揃える（空ならそのまま）
    if (out && !out.endsWith("。")) out += "。";
    return out;
  }

  function _splitYoinForLine(yoinSummaryRaw) {
    // buildYoinLine() が返す「global+center」1行を、LINE向けに “地層行 / 中心行” に分割する
    // 例:
    //  地層：...｜...。要素が混ざって...、質感は「...」寄り。
    // =>
    //  地層：...｜...
    //  要素が混ざって...
    const s = String(yoinSummaryRaw || "").trim();
    if (!s) return { globalLine: "", centerLine: "" };

    // 先頭が「地層：」なら、最初の「。」で切る
    const isLayer = s.startsWith("地層：");
    if (!isLayer) return { globalLine: "", centerLine: _stripQualityPhrase(s) };

    const idx = s.indexOf("。");
    if (idx < 0) return { globalLine: s, centerLine: "" };

    const globalLine = s.slice(0, idx).trim(); // 「。」は落とす（1行化）
    const rest = s.slice(idx + 1).trim();
    const centerLine = _stripQualityPhrase(rest);

    return { globalLine, centerLine };
  }

  function _buildYoinBlocksV33(story, { channel, seedBase, pickStable }) {
    // channel: "x" | "line"
    // 目的：X/LINEで “余韻の役割” を統一しつつ、重複を生まない構造にする

    // buildYoinLine は「global+center」合体の正本（copy.YOIN.GLUE優先）
    const yoinSummaryRaw = buildYoinLine(story);

    // 残り香（LINEは毎回2行、Xは closeLines 側で出すのでここでは出さない）
    const poolA = Array.isArray(RENDER_COPY?.YOIN?.TAIL_POOL_1) ? RENDER_COPY.YOIN.TAIL_POOL_1 : [];
    const poolB = Array.isArray(RENDER_COPY?.YOIN?.TAIL_POOL_2) ? RENDER_COPY.YOIN.TAIL_POOL_2 : [];

    const tail1 = typeof pickStable === "function" && poolA.length ? pickStable(poolA, seedBase + "|a") : "";
    const tail2 = typeof pickStable === "function" && poolB.length ? pickStable(poolB, seedBase + "|b") : "";

    if (channel === "x") {
      // ✅ Xは “説明を1回にする” ：地層短文だけを優先して入れる
      // buildYoinGlobal が既に「地層：...中心は...｜...」を吐けるので、それをXの余韻として採用
      const layerLine = String(
        buildYoinGlobal(story, { compact: true, maxContacts: 12, minWeight: 0.10 }) || ""
      ).trim();

      return {
        // Xはここだけ使う（closeは別）
        xYoinLine: layerLine || RENDER_COPY?.YOIN?.FALLBACK || "",
        // LINE用も返しておく（将来共通化しやすい）
        lineGlobal: "",
        lineCenter: "",
        lineTail1: tail1,
        lineTail2: tail2,
      };
    }

    // LINE：地層行と中心行を“分けて”見せる（うるささが消える）
    const { globalLine, centerLine } = _splitYoinForLine(yoinSummaryRaw);

    return {
      xYoinLine: "",
      lineGlobal: globalLine,
      lineCenter: centerLine,
      lineTail1: tail1,
      lineTail2: tail2,
    };
  }

  function _filterKeepBlanks(arr) {
    // ✅ 空文字 "" は残す（改行設計のため）
    return arr.filter((v) => v !== null && v !== undefined);
  }

  // --------------------
  // X (copy-driven) v3.3.3 FULL
  // --------------------
  function renderX(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSignJa = story?.public?.moon?.sign_ja || null;

    // close lines（日替わり）
    const pool = Array.isArray(RENDER_COPY.X_FORMAT.CLOSE_LINES_POOL)
      ? RENDER_COPY.X_FORMAT.CLOSE_LINES_POOL
      : [];

    const seedClose = `${story?.meta?.date_local || dateLabel}|close`;
    const idx = pool.length ? (hash32(seedClose) % pool.length) : -1;
    const closeLines = idx >= 0 ? pool[idx] : RENDER_COPY.X_FORMAT.CLOSE_LINES;

    const center = pickCenterPublicContact(story);
    const MAX = 260;

    const userSeed =
      story?.personal?.user_id ||
      story?.meta?.app_user_id ||
      story?.meta?.appUserId ||
      "public";

    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}|yoin`;

    // ✅ X余韻は “地層1行” に固定（重複回避）
    const yoinPack = _buildYoinBlocksV33(story, {
      channel: "x",
      seedBase,
      pickStable,
    });

    const buildRole = ({ moon, shadowMax, keepYoin, keepArrow }) => {
      if (!center) {
        const noContact = buildNoContactLine(story);
        return RENDER_COPY.X_FORMAT.BLOCK_ROLE({
          dateLabel,
          moonSignJa: moon ? moonSignJa : null,
          mainLine: noContact,
          mainArrow: "",
          shadowLines: [],
          yoinShort: keepYoin ? yoinPack.xYoinLine : "",
          closeLines,
        });
      }

      const mainLine = RENDER_COPY.X_FORMAT.SKY_LINE({
        emoji: "☄️",
        aLabel: fmtAnyJa(center.a),
        aSignJa: publicSignJa(story, center.a),
        bLabel: fmtAnyJa(center.b),
        bSignJa: publicSignJa(story, center.b),
        aspectJa: fmtAspectJa(center.type),
        orb: Number(center.orb_deg),
      });

      const core =
        (typeof aspectCore === "function" ? aspectCore(center.type) : null) ||
        ASPECTS_META?.[center.type]?.core ||
        null;

      const aTone = signMeta(publicSignKey(story, center.a))?.tone || null;
      const bTone = signMeta(publicSignKey(story, center.b))?.tone || null;
      const tone = aTone || bTone || "";

      const mainArrow = keepArrow ? RENDER_COPY.X_FORMAT.MAIN_ARROW(core || tone || "") : "";

      // ✅ 影：secret優先、なければtop2、最大は shadowMax（variantsで1に寄せる）
      const shadowLines = [];
      const secret = pickSecretPublicContact(story);
      if (secret) {
        shadowLines.push(
          RENDER_COPY.X_FORMAT.SECRET_LINE({
            aLabel: fmtAnyJa(secret.a),
            aSignJa: publicSignJa(story, secret.a),
            bLabel: fmtAnyJa(secret.b),
            bSignJa: publicSignJa(story, secret.b),
            aspectJa: fmtAspectJa(secret.type),
            orb: Number(secret.orb_deg),
          })
        );
      }

      const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
      const t2 = skyTop?.[1] || null;

      const isDup =
        t2 &&
        secret &&
        (typeof skyKey === "function"
          ? skyKey(t2) === skyKey(secret)
          : `${t2.a}|${t2.b}|${t2.type}` === `${secret.a}|${secret.b}|${secret.type}`);

      if (t2 && !isDup) {
        shadowLines.push(
          RENDER_COPY.X_FORMAT.SKY_LINE({
            emoji: "☄️",
            aLabel: fmtAnyJa(t2.a),
            aSignJa: publicSignJa(story, t2.a),
            bLabel: fmtAnyJa(t2.b),
            bSignJa: publicSignJa(story, t2.b),
            aspectJa: fmtAspectJa(t2.type),
            orb: Number(t2.orb_deg),
          })
        );
      }

      return RENDER_COPY.X_FORMAT.BLOCK_ROLE({
        dateLabel,
        moonSignJa: moon ? moonSignJa : null,
        mainLine,
        mainArrow,
        shadowLines: shadowLines.slice(0, shadowMax),
        yoinShort: keepYoin ? yoinPack.xYoinLine : "",
        closeLines,
      });
    };

    // ✅ 方針：影は基本1（入らない前提）、あとは削る順序だけ
    const variants = [
      { moon: true, shadowMax: 1, keepYoin: true, keepArrow: true },
      { moon: true, shadowMax: 1, keepYoin: false, keepArrow: true },
      { moon: true, shadowMax: 1, keepYoin: false, keepArrow: false },
      { moon: false, shadowMax: 1, keepYoin: false, keepArrow: false },
    ];

    let text = "";
    for (const v of variants) {
      text = buildRole(v);
      if (text.length <= MAX) break;
    }

    if (text.length > MAX) text = text.slice(0, MAX - 1) + "…";
    return text;
  }

  // --------------------
  // LINE v3.3.3 (Fixed structure + correct blank lines + de-dup yoin)
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

      if (theme0) {
        used.add(tpKey(theme0));
        parts.push(`${HEAD_LAYERS.THEME}\n${formatPersonalTPLine(story, theme0, `${CIRCLES[0]} `)}`);
      }

      if (touch[0]) {
        used.add(tpKey(touch[0]));
        parts.push(`${HEAD_LAYERS.TOUCH}\n${formatPersonalTPLine(story, touch[0], `${CIRCLES[1]} `)}`);
      }
      if (touch[1]) {
        used.add(tpKey(touch[1]));
        parts.push(`${formatPersonalTPLine(story, touch[1], `${CIRCLES[2]} `)}`);
      }

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

    // --------------------
    // Aftertaste（今日の余韻）v3.3.3
    // - LINEでは「地層行」と「中心行」を分けて見せる
    // - 「質感は…寄り」の重複は中心行から除去
    // - 残り香2行は余韻ブロック内に置く
    // --------------------
    const userSeed =
      story?.personal?.user_id ||
      story?.meta?.app_user_id ||
      story?.meta?.appUserId ||
      "public";

    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}|yoin`;

    const yoinPack = _buildYoinBlocksV33(story, {
      channel: "line",
      seedBase,
      pickStable,
    });

    const headYoin = RENDER_COPY?.HEAD_YOIN || "【今日の余韻】";

    const yoinLines = [];
    if (yoinPack.lineGlobal) yoinLines.push(yoinPack.lineGlobal);
    if (yoinPack.lineCenter) yoinLines.push(yoinPack.lineCenter);

    const yoinBlock = RENDER_COPY.LINE_YOIN_COMPACT
      ? [
        ...yoinLines,
      ].filter((v) => typeof v === "string").join("\n")
      : [
        ...yoinLines,
        // "",
        // --- Optional Aftertaste Tails ---------------------------------
        // 以下の2行は「余韻を言葉で導きたい時」用の残り香。
        // 通常はオフ推奨。
        // 理由：
        // - 上段（地層＋中心）で余韻はすでに閉じている
        // - ここを出すと「余韻の説明」になりやすい
        // - ソラのこえ。は“置いて終わる”方が強い
        //
        // 必要になるケース例：
        // - 初期フェーズで世界観を伝えたい時
        // - LINE新規登録直後（思想の補助線が必要な時）
        // - 感情が強く揺れる配置の日に、着地点を用意したい時
        //
        // 再有効化する場合は、
        // yoinTail1 / yoinTail2 を yoinBlock に戻すだけでOK。
        //
        // "答えより、手触りを持ち帰る。"
        // "余白を残して、次に渡す."
        // ---------------------------------------------------------------
        // yoinPack.lineTail1,
        // yoinPack.lineTail2,

      ].filter((v) => typeof v === "string").join("\n");

    // --------------------
    // Optional: Global Yoin Detail block（copyがHEAD_YOIN_GLOBALを持つ時だけ）
    // --------------------
    const globalHead = RENDER_COPY?.HEAD_YOIN_GLOBAL || "";
    const globalDetail =
      globalHead && typeof RENDER_COPY?.YOIN_GLOBAL?.BUILD_DETAIL === "function"
        ? `${globalHead}\n${RENDER_COPY.YOIN_GLOBAL.BUILD_DETAIL({
          story,
          seedBase: seedBase + "|global_detail",
          pickStable,
          buildYoinGlobal,
        })}`
        : "";

    // ✅ 改行設計：空行 "" を消さない
    return _filterKeepBlanks([
      RENDER_COPY.LINE_TITLE(dateLabel),
      "",
      head,
      "",
      parts.join("\n\n"),
      "",
      moonLine,
      "",
      headYoin,
      yoinBlock,
      globalDetail ? "" : null,
      globalDetail || null,
      "",
      ...RENDER_COPY.FOOTER_LINE,
    ]).join("\n");
  }


  // --------------------
  // IG (copy-driven)
  // --------------------
  function renderIG(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSign = story?.public?.moon?.sign_ja || null;

    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];

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

    // formatters
    fmtAspectJa,
    fmtBodyJa,
    fmtPointJa,

    // natal
    renderNatalListFromCache,

    // yoin
    buildYoinLine,
    buildYoinGlobal,
  };
}

module.exports = { createRenderers };
