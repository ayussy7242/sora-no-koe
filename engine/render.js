// engine/render.js
"use strict";

/**
 * render.js (STABLE / V1-source-of-truth) — Unified v3.3.5 (v2026.01+)
 *
 * ゴール：
 * - V1 dict (ASPECTS_V1 / PLANETS_V1 / POINTS_V1 / SIGNS_V1 / BLEND_V1) を最優先で参照
 * - copy(render_copy) を固定文言SSOTとして尊重
 * - 占い化しない（no prediction / no should / no good-bad）
 * - 互換を壊さない：renderLine/renderX/renderIG/renderSoraLine/renderSoraAllLine/buildYoinGlobal/buildYoinLine 等は維持
 *
 * v3.3.5 変更点（設計/最適化/将来性）：
 * - meta / sign の参照を内部でメモ化（頻出 lookup を高速化）
 * - buildYoinGlobal / renderSoraBase の「表示と一致」をデフォで担保しやすい導線を強化
 * - BLENDブロック生成の分岐を整理（個人TPの新旧を安全に切替）
 * - public分布カウント（B案：両端カウント）を一つの実装に集約し、互換関数は薄いラッパーに
 * - 例外に強いガード（欠損 story/dict でも落ちない）
 */

const { pickStable, getUserId } = require("./render_parts/seed");
const makeSignHelpers = require("./render_parts/signs");
const fmt = require("./render_parts/format");

function createRenderers({ BODY_JA = {}, POINT_JA = {}, ASPECT_JA = {}, dict = null } = {}) {
  // --------------------
  // COPY (fixed wording SSOT)
  // --------------------
  const { RENDER_COPY } = require("../copy/render");

  // close picker (カテゴリ→安定抽選)
  const { pickCloseLines } = require("./close_picker");

  // --------------------
  // dict normalize (V1 preferred)
  // --------------------
  const ASPECTS_V1 = dict?.ASPECTS_V1 || null;
  const PLANETS_V1 = dict?.PLANETS_V1 || null;
  const POINTS_V1 = dict?.POINTS_V1 || null;
  const SIGNS_V1 = dict?.SIGNS_V1 || null;
  const BLEND_V1 = dict?.BLEND_V1 || null;

  // optional META inputs (fallback if V1 is missing)
  const ASPECTS_META_IN = dict?.ASPECTS_META || null;
  const PLANETS_META_IN = dict?.PLANETS_META || null;
  const POINTS_META_IN = dict?.POINTS_META || null;

  // sign helpers (SIGNS_V1 missingでも makeSignHelpers 側が安全に動く想定)
  const { signMeta, signJaFromIndex, publicSignJa, publicSignKey } = makeSignHelpers(SIGNS_V1);

  // --------------------
  // internal safe JA maps (dict missing時の最低限)
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

  // ============================================================
  // Meta builders (from V1) — one-time build
  // ============================================================
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

    for (const [k, v] of Object.entries(deep)) {
      if (!v || typeof v !== "object") continue;
      if (!("label_ja" in v) && !("core" in v) && !("sora" in v)) continue;
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

  const ASPECTS_META = ASPECTS_V1 ? buildAspectsMetaFromV1() : (ASPECTS_META_IN || {});
  const PLANETS_META = PLANETS_V1 ? buildPlanetsMetaFromV1() : (PLANETS_META_IN || {});
  const POINTS_META = POINTS_V1 ? buildPointsMetaFromV1() : (POINTS_META_IN || {});

  // ============================================================
  // Small memoizers (hot paths)
  // ============================================================
  const _memo = {
    signMeta: new Map(), // key -> meta
    bodyJa: new Map(),
    pointJa: new Map(),
    aspectJa: new Map(),
    coreOf: new Map(),
    aspectCore: new Map(),
  };

  function memoSignMeta(signKey) {
    const k = String(signKey || "").toLowerCase();
    if (!k) return null;
    if (_memo.signMeta.has(k)) return _memo.signMeta.get(k);
    const v = signMeta(k) || null;
    _memo.signMeta.set(k, v);
    return v;
  }

  // ============================================================
  // formatters
  // ============================================================
  function fmtAspectJa(aspectType) {
    const k = String(aspectType || "");
    if (_memo.aspectJa.has(k)) return _memo.aspectJa.get(k);

    const v =
      ASPECTS_META?.[k]?.label_ja ||
      ASPECT_JA?.[k] ||
      k;

    _memo.aspectJa.set(k, v);
    return v;
  }

  function fmtBodyJa(bodyKey) {
    const k = String(bodyKey || "");
    if (_memo.bodyJa.has(k)) return _memo.bodyJa.get(k);

    const v =
      PLANETS_META?.[k]?.label_ja ||
      BODY_JA?.[k] ||
      SAFE_BODY_JA?.[k] ||
      k;

    _memo.bodyJa.set(k, v);
    return v;
  }

  function fmtPointJa(pointKey) {
    const k = String(pointKey || "");
    if (_memo.pointJa.has(k)) return _memo.pointJa.get(k);

    const v =
      POINTS_META?.[k]?.label_ja ||
      POINT_JA?.[k] ||
      SAFE_POINT_JA?.[k] ||
      k;

    _memo.pointJa.set(k, v);
    return v;
  }

  function fmtAnyJa(key) {
    const k = String(key || "");
    const p = fmtPointJa(k);
    if (p && p !== k) return p;
    return fmtBodyJa(k);
  }

  function coreOf(key) {
    const k = String(key || "");
    if (_memo.coreOf.has(k)) return _memo.coreOf.get(k);

    const v =
      PLANETS_META?.[k]?.core ||
      POINTS_META?.[k]?.core ||
      null;

    _memo.coreOf.set(k, v);
    return v;
  }

  function aspectCore(type) {
    const k = String(type || "");
    if (_memo.aspectCore.has(k)) return _memo.aspectCore.get(k);

    const v = ASPECTS_META?.[k]?.core || null;
    _memo.aspectCore.set(k, v);
    return v;
  }

  function fmtDeg(n) {
    if (n === null || n === undefined) return "";
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n);
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  // ============================================================
  // meaning lines (non-predictive)
  // ============================================================
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

  // ============================================================
  // layers helpers
  // ============================================================
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

  function skyKey(r) {
    if (!r) return "";
    return `${r.a || ""}|${r.b || ""}|${r.type || ""}`;
  }

  function tplFill(str, vars = {}) {
    return String(str || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  }

  // ============================================================
  // BLEND helpers
  // ============================================================
  function buildPlanetInSignBlend(_tpSide /* "natal" | "transit" */, bodyKey, signKey, signJa) {
    if (!BLEND_V1?.planet_in_sign) return null;

    const p = BLEND_V1.planet_in_sign;
    const sk = String(signKey || "").toLowerCase();

    const planetCore =
      p.planet_core_override_ja?.[bodyKey] ||
      PLANETS_META?.[bodyKey]?.core ||
      coreOf(bodyKey) ||
      "";

    const signCore =
      p.sign_core_override_ja?.[sk] ||
      SIGNS_V1?.signs?.[sk]?.core ||
      "";

    const sJa =
      signJa ||
      SIGNS_V1?.signs?.[sk]?.label_ja ||
      "";

    const planetJa = fmtAnyJa(bodyKey);

    const pattern = p.pattern_ja || "{sign}の{planet}：{sign_core}の領域で、{planet_core}";
    return tplFill(pattern, {
      sign: sJa,
      planet: planetJa,
      sign_core: signCore,
      planet_core: planetCore,
    }).trim();
  }

  function aspectSentenceByLabel(aspectLabelJa) {
    const TP_ITEM_V1 = dict?.TP_ITEM_V1 || null;

    const s1 = TP_ITEM_V1?.aspect_sentence?.by_label_ja?.[aspectLabelJa] || null;
    if (s1) return String(s1).trim();

    const s2 = BLEND_V1?.aspect_sentence?.by_label_ja?.[aspectLabelJa] || null;
    if (s2) return String(s2).trim();

    // ASPECTS_META の sora を label_ja で拾う（互換）
    const hit = Object.values(ASPECTS_META || {}).find((v) => v?.label_ja === aspectLabelJa);
    if (hit?.sora) return String(hit.sora).trim();

    return "配置として現れやすい。";
  }

  // ============================================================
  // Personal TP line
  // ============================================================
  function formatPersonalTPLine(story, tp, labelPrefix = "") {
    if (!tp) return "";

    const aKey = tp.natal_body_or_point;
    const bKey = tp.transit_body;

    const aJa = fmtAnyJa(aKey);
    const bJa = fmtAnyJa(bKey);

    const aSignJa = tp.natal_sign_ja || "";
    const bSignJa = tp.transit_sign_ja || "";

    const aSignKey = String(tp.natal_sign_key || tp.natal_sign_en || "").toLowerCase() || null;
    const bSignKey = String(tp.transit_sign_key || tp.transit_sign_en || "").toLowerCase() || null;

    const aspType = tp.aspect || tp.type;
    const aspJa = fmtAspectJa(aspType);
    const deg = fmtDeg(tp.aspect_deg);
    const orb = fmtDeg(tp.orb_deg);

    // --- BLENDがあれば：新しいブロック生成
    if (BLEND_V1?.planet_in_sign && BLEND_V1?.blocks?.personal_aspect_block) {
      const st = BLEND_V1.style || {};
      const dash = st.dash || "｜";
      const x = st.x || "×";
      const arrow = st.arrow || "→";
      const br = st.line_break || "\n";

      const idx = String(labelPrefix || "").trim();

      const natalTitle = `${aJa}${aSignJa ? `（${aSignJa}）` : ""}`;
      const transitTitle = `${bJa}${bSignJa ? `（${bSignJa}）` : ""}`;

      const headerTpl = BLEND_V1.blocks.personal_aspect_block.header_ja;
      const header = headerTpl
        ? tplFill(headerTpl, {
          idx,
          natal: natalTitle,
          transit: transitTitle,
          aspect: aspJa,
          angle: deg,
          orb: orb,
          dash,
          x,
        })
          .replace(/\s+/g, " ")
          .trim()
        : `${idx ? `${idx} ` : ""}ネイタル：${natalTitle} ${x} トランジット：${transitTitle} ${dash} ${aspJa}（${deg}°${dash}orb ${orb}°）`;

      const natalBlend = buildPlanetInSignBlend("natal", aKey, aSignKey, aSignJa) || natalTitle;
      const transitBlend = buildPlanetInSignBlend("transit", bKey, bSignKey, bSignJa) || transitTitle;
      const aspectSentence = aspectSentenceByLabel(aspJa);

      const lines = [header, natalBlend, transitBlend, `${arrow} ${aspectSentence}`].filter(Boolean);
      return lines.join(br).trim();
    }

    // --- fallback（旧）
    const { LABELS } = RENDER_COPY;
    const title =
      `${labelPrefix}` +
      `${LABELS?.NATAL || "ネイタル："}${aJa}${aSignJa ? `（${aSignJa}）` : ""} × ` +
      `${LABELS?.TRANSIT || "トランジット："}${bJa}${bSignJa ? `（${bSignJa}）` : ""}` +
      `｜${aspJa}（${deg}°｜orb ${orb}°）`;

    const mean = oneLineMeaning({ aKey, bKey, aspectType: aspType });
    return `${title}\n${mean}`;
  }

  // ============================================================
  // Public pickers
  // ============================================================
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

  // ============================================================
  // Public formatters
  // ============================================================
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

  // public “そら” 用：意味は足さず「配置だけ」2行（読みやすさ最優先）
  function formatSoraSkyLine(story, s, labelPrefix = "・") {
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

    const line1 = `${labelPrefix}${aJa}${aSign} × ${bJa}${bSign}`.trim();
    const line2 = `ー${aspJa}  ${deg}°｜orb ${orb}°`.trim();

    return `${line1}\n${line2}`;
  }

  // ============================================================
  // seeded "no contact" line
  // ============================================================
  function buildNoContactLine(story) {
    const moonKey = (story?.public?.moon?.sign_key || "").toLowerCase() || null;
    const s = moonKey ? memoSignMeta(moonKey) : null;

    const element = s?.element || null;
    const modality = s?.modality || null;
    const signJa = s?.label_ja || story?.public?.moon?.sign_ja || null;

    const dateLocal = story?.meta?.date_local || "";
    const userId = getUserId(story);
    const seedBase = `${dateLocal}|${userId}|no_contact`;

    const pools = RENDER_COPY.NO_CONTACT;

    const aPool = pools.byElement[element] || pools.byElement.default;
    const a = pickStable(aPool, seedBase + "|a");

    const bPool = pools.byModality[modality] || pools.byModality.default;
    const b = pickStable(bPool, seedBase + "|b") || "";

    const head = pools.headMoonTaste(signJa);
    return pools.glue(head, a, b);
  }

  // ============================================================
  // yoin helpers (global scoring)
  // ============================================================
  function orbMaxFromStory(story, fallback = 6) {
    const orbMax = Number(story?.meta?.rules?.orb_max_deg);
    return Number.isFinite(orbMax) && orbMax > 0 ? orbMax : fallback;
  }

  function weightFromOrb(orb, orbMax) {
    const o = Number(orb);
    const m = Number(orbMax);
    if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return 0;

    const w = 1 - Math.min(Math.max(o, 0), m) / m;
    return Math.max(0.15, w);
  }

  // ============================================================
  // YOIN v3.3.5 — public-first global + override
  // ============================================================

  // center-driven summary (short)
  // - kind: "public" | "personal" | "auto"
  //   public: public centerのみ参照（theme0は見ない）
  //   personal: theme0優先（なければpublic centerへフォールバック）
  //   auto: layersがあればpersonal、なければpublic
  function buildYoinCenter(story, opts = {}) {
    const { kind = "public" } = opts || {};

    const layers = getSkyLayers(story);
    const hasPersonal = !!layers;

    const resolvedKind =
      kind === "auto"
        ? (hasPersonal ? "personal" : "public")
        : kind;

    const theme0 =
      resolvedKind === "personal"
        ? (layers?.theme?.[0] ?? null)
        : null;

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

    const aMeta = memoSignMeta(signKeyA);
    const bMeta = memoSignMeta(signKeyB);

    const eA = aMeta?.element || null;
    const eB = bMeta?.element || null;
    const mA = aMeta?.modality || null;
    const mB = bMeta?.modality || null;

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
      aspectLabel: aspectCoreText || null,
    });
  }

  /**
   * buildYoinGlobal(story, opts)
   * - contactsOverride を渡すと「表示と完全一致」する（ズレ根絶）
   * - kind: "public" | "personal" | "auto"
   * - statsScope: "top" | "all"（top は topContacts の重み / all は scored 全体の重み）
   */
  function buildYoinGlobal(story, opts = {}) {
    const {
      contactsOverride = null,
      kind = "public",
      maxContacts = 10,
      minWeight = 0.12,
      includeDeep = true,
      compact = true,
      statsScope = "top",
    } = opts || {};

    const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
    const userSeed = getUserId(story);
    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}|yoin_global`;

    const layers = getSkyLayers(story);
    let contacts = [];

    // 1) 外から渡された contacts を最優先（表示一致）
    if (Array.isArray(contactsOverride) && contactsOverride.length) {
      contacts = contactsOverride;

      // 2) public（sky_all）
    } else if (kind === "public") {
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

      // 3) personal（layers）
    } else if (kind === "personal") {
      const allTp = []
        .concat(Array.isArray(layers?.theme) ? layers.theme : [])
        .concat(Array.isArray(layers?.touch) ? layers.touch : [])
        .concat(Array.isArray(layers?.hidden) ? layers.hidden : [])
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

      // 4) auto（互換）
    } else {
      if (layers) return buildYoinGlobal(story, { ...opts, kind: "personal", contactsOverride: null });
      return buildYoinGlobal(story, { ...opts, kind: "public", contactsOverride: null });
    }

    if (!contacts.length) return "";

    const OM = orbMaxFromStory(story, 6);

    const scored = contacts
      .map((c) => ({ ...c, w: weightFromOrb(c.orb_deg, OM) }))
      .filter((c) => c.w >= minWeight)
      .sort((a, b) => b.w - a.w);

    const top = scored.slice(0, maxContacts);
    if (!top.length) return "";

    // element/modality weighted tallies
    const E = { fire: 0, earth: 0, air: 0, water: 0, mixed: 0, unknown: 0 };
    const M = { cardinal: 0, fixed: 0, mutable: 0, mixed: 0, unknown: 0 };

    function addSignKey(signKey, w) {
      const s = memoSignMeta(signKey);
      const e = s?.element || "unknown";
      const m = s?.modality || "unknown";

      if (!(e in E)) E.unknown += w;
      else E[e] += w;

      if (!(m in M)) M.unknown += w;
      else M[m] += w;
    }

    const scope = statsScope === "all" ? scored : top;
    for (const c of scope) {
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

    // aspect core candidates (top contacts)
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

    // preferred
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

    // fallback
    if (typeof RENDER_COPY?.YOIN?.BUILD === "function") {
      return RENDER_COPY.YOIN.BUILD({
        topElement,
        topModality,
        aspectLabel: core1 || null,
      });
    }

    return "";
  }

  // GLOBAL(short) + CENTER(short)
  function buildYoinLine(story, opts = {}) {
    const {
      kind = "public",
      contactsForGlobal = null,
      maxContacts = 10,
      minWeight = 0.12,
      includeDeep = true,
      compact = true,
      statsScope = "top",
    } = opts || {};

    const global = buildYoinGlobal(story, {
      kind,
      contactsOverride: contactsForGlobal,
      maxContacts,
      minWeight,
      includeDeep,
      compact,
      statsScope,
    });

    const center = buildYoinCenter(story, { kind });

    const glue = RENDER_COPY?.YOIN?.GLUE;
    if (typeof glue === "function") return glue(global, center);

    return [global, center].filter(Boolean).join("\n");
  }

  // ============================================================
  // moon line (互換保持：内部 util)
  // ============================================================
  function buildMoonLine(story) {
    const moon = story?.public?.moon || {};
    const moonSignJa = moon?.sign_ja || null;
    const moonSignKey = moon?.sign_key || null;
    const s = moonSignKey ? memoSignMeta(moonSignKey) : null;

    const hint = s?.core || s?.sora_short || s?.field || null;

    if (moonSignJa) return RENDER_COPY.MOON_LINE_OK(moonSignJa, hint);
    return RENDER_COPY.MOON_LINE_LOADING();
  }

  // ============================================================
  // public “そら” 用：分布（B案：両端カウント）
  // ============================================================
  function buildPublicEndpointElementCounts(story, list = []) {
    const element = { fire: 0, earth: 0, air: 0, water: 0 };
    const modality = { cardinal: 0, fixed: 0, mutable: 0 };

    function addByBody(bodyKey) {
      const signKey = publicSignKey(story, bodyKey);
      const s = memoSignMeta(signKey);
      const e = s?.element || null;
      const m = s?.modality || null;
      if (e && e in element) element[e] += 1;
      if (m && m in modality) modality[m] += 1;
    }

    for (const r of Array.isArray(list) ? list : []) {
      if (r?.a) addByBody(r.a);
      if (r?.b) addByBody(r.b);
    }

    const total = Math.max(0, (Array.isArray(list) ? list.length : 0) * 2);
    return { element, modality, total };
  }

  // 互換ラッパー：他コードが呼んでも壊れない
  function buildPublicPlanetElementCounts(story, list = []) {
    const ep = buildPublicEndpointElementCounts(story, list);
    return {
      fire: ep.element.fire || 0,
      earth: ep.element.earth || 0,
      air: ep.element.air || 0,
      water: ep.element.water || 0,
      unknown: 0,
      total: ep.total || 0,
    };
  }

  // 互換：旧関数（ただし renderSoraBase では使わない）
  function buildPublicDistributionCounts(story, maxUse = 24) {
    const all = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    if (!all.length) {
      return {
        element: { fire: 0, earth: 0, air: 0, water: 0 },
        modality: { cardinal: 0, fixed: 0, mutable: 0 },
      };
    }

    const list = all
      .filter((r) => Number.isFinite(Number(r?.orb_deg)))
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg))
      .slice(0, Math.max(3, Math.min(maxUse, all.length)));

    const ep = buildPublicEndpointElementCounts(story, list);
    return { element: ep.element, modality: ep.modality };
  }

  // ============================================================
  // LINE main (v3.3.5) — copy-driven template
  // ============================================================
  function clampLines(s, maxLines = 2) {
    const lines = String(s || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.slice(0, Math.max(1, maxLines)).join("\n");
  }

  function renderLine(story) {
    const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
    const layers = getSkyLayers(story);
    const hasPersonal = !!layers;

    const { HEAD_LAYERS, CIRCLES } = RENDER_COPY;
    const parts = [];
    const used = new Set();

    // personal
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
      if (hidden) parts.push(`${HEAD_LAYERS.HIDDEN}\n${formatPersonalTPLine(story, hidden, "・")}`);

      if (!parts.length) parts.push(buildNoContactLine(story));
    } else {
      // public fallback
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

    const yoinRaw = hasPersonal
      ? buildYoinLine(story, { kind: "personal", statsScope: "all" })
      : buildYoinLine(story, { kind: "public", statsScope: "top" });

    const yoin = clampYoin2(yoinRaw);

    return RENDER_COPY.TPL.LINE.buildMain({
      dateLabel,
      parts: parts.join("\n\n"),
      kusouYoin: yoin,
      footerLines: RENDER_COPY.FOOTER_LINE,
      cta: RENDER_COPY.LINE_MAIN_CTA,
    });
  }

  function clampYoin2(s) {
    const lines = String(s || "").split("\n").map(l => l.trim()).filter(Boolean);
    const l1 = lines[0] || "";
    let l2 = lines[1] || "";

    // 2行目だけ短文化（最初の句点まで）
    if (l2.length > 34) {
      const m = l2.match(/^(.{1,60}?。)/);
      if (m) l2 = m[1];
    }
    return [l1, l2].filter(Boolean).slice(0, 2).join("\n");
  }

  // ============================================================
  // public “そら” LINE（new）— 配置だけ + 分布 + 空層
  // ============================================================
  function renderSoraLine(story) {
    return renderSoraBase(story, { limit: 15, listTitle: RENDER_COPY.HEAD_SORA_SKY_TOP15 });
  }

  function renderSoraAllLine(story) {
    return renderSoraBase(story, { limit: Infinity, listTitle: RENDER_COPY.HEAD_SORA_SKY_ALL });
  }

  function renderSoraBase(story, opts = {}) {
    const limit =
      opts.limit === Infinity
        ? Infinity
        : (Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 15);

    const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");

    const moonLine = (() => {
      const moonJa = story?.public?.moon?.sign_ja || null;
      return moonJa ? `🌙月：${moonJa}` : "";
    })();

    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const sorted = skyAll
      .filter((r) => Number.isFinite(Number(r?.orb_deg)))
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));

    const list = limit === Infinity ? sorted : sorted.slice(0, Math.max(1, limit));

    const mainLines = list.length
      ? list.map((s) => formatSoraSkyLine(story, s, "・")).join("\n\n")
      : "";

    // 分布（B案）：表示してる list を両端カウント
    const ep = buildPublicEndpointElementCounts(story, list);
    const distLines =
      (RENDER_COPY?.DIST?.ELEMENT_LINE && RENDER_COPY?.DIST?.MODALITY_LINE)
        ? [RENDER_COPY.DIST.ELEMENT_LINE(ep.element), RENDER_COPY.DIST.MODALITY_LINE(ep.modality)].join("\n")
        : "";

    // 空層：表示と一致させるため、contactsOverride を必ず使う
    const isAll = (limit === Infinity);
    const contactsForGlobal = (isAll ? sorted : list).map((r) => ({
      kind: "public",
      a: r?.a,
      b: r?.b,
      type: r?.type,
      aSignKey: publicSignKey(story, r?.a),
      bSignKey: publicSignKey(story, r?.b),
      orb_deg: Number.isFinite(Number(r?.orb_deg)) ? Number(r.orb_deg) : null,
    }));

    const kusouText = String(
      buildYoinGlobal(story, {
        contactsOverride: contactsForGlobal,
        kind: "public",
        maxContacts: 10,
        minWeight: 0.12,
        includeDeep: true,
        compact: true,
        statsScope: isAll ? "all" : "top",
      })
    ).trim();

    return RENDER_COPY.TPL.LINE.buildSora({
      dateLabel,
      mainLines,
      moonLine,
      distLines,
      kusouYoin: kusouText,
      footerLines: RENDER_COPY.FOOTER_SORA_LINE,
      listTitle: opts.listTitle,
    });
  }

  // ============================================================
  // X v3.3.5 (minimal / no roles)
  // ============================================================
  function renderX(story) {
    const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
    const moonSignJa = story?.public?.moon?.sign_ja || "";

    const userSeed = getUserId(story);
    const seedBase = `${story?.meta?.date_local || dateLabel}|${userSeed}`;

    const yoinPack =
      typeof fmt?.buildYoinBlocks === "function"
        ? fmt.buildYoinBlocks(
          story,
          { channel: "x", seedBase: `${seedBase}|yoin` },
          { buildYoinLine, buildYoinGlobal, RENDER_COPY, pickStable }
        )
        : { xYoinLine: buildYoinLine(story) };

    const center = pickCenterPublicContact(story);
    const secret = pickSecretPublicContact(story);

    const main1 = center
      ? fmt.formatSkyLineX(story, center, "☄️", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
      : "";

    const main2 = secret
      ? fmt.formatSkyLineX(story, secret, "🪐", { fmtAnyJa, publicSignJa, fmtAspectJa, fmtDeg })
      : "";

    const yoin = fmt.formatYoinForX(yoinPack?.xYoinLine);

    const closeLines = pickCloseLines(RENDER_COPY, story, { seedBase, pickStable });

    const footer = String(RENDER_COPY?.FOOTER_X || "星は語る。🌎🛸").trim();
    const closeArr = (Array.isArray(closeLines) ? closeLines : [String(closeLines || "")])
      .map((l) => String(l || "").trim())
      .filter(Boolean)
      .filter((l) => l !== footer);

    const MAX = 270;

    function build({ keepSecond, keepYoin, keepClose }) {
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

      if (keepYoin && yoin) {
        lines.push("");
        yoin.split("\n").forEach((l) => lines.push(l));
      }

      if (keepClose && closeArr.length) {
        lines.push("");
        lines.push(...closeArr);
      }

      lines.push("");
      lines.push(footer);

      return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    const variants = [
      { keepSecond: true, keepYoin: true, keepClose: true },
      { keepSecond: false, keepYoin: true, keepClose: true },
      { keepSecond: false, keepYoin: true, keepClose: false },
      { keepSecond: false, keepYoin: false, keepClose: true },
      { keepSecond: false, keepYoin: false, keepClose: false },
    ];

    let text = "";
    for (const v of variants) {
      text = build(v);
      if (text.length <= MAX) break;
    }

    if (text.length > MAX) text = text.slice(0, MAX - 1) + "…";
    return text;
  }

  // ============================================================
  // IG (copy-driven)
  // ============================================================
  function renderIG(story) {
    const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".");
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

      const aTone = memoSignMeta(publicSignKey(story, aKey))?.tone || null;
      const bTone = memoSignMeta(publicSignKey(story, bKey))?.tone || null;
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

  // ============================================================
  // natal list (LINE command: わたしのほし) — ASC/MC 必須
  // ============================================================
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
    if (!Number.isFinite(Number(asc)) || !Number.isFinite(Number(mc))) {
      return RENDER_COPY.NATAL_LIST.MISSING_ANGLES();
    }

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

  // ============================================================
  // exports
  // ============================================================
  return {
    // outputs（互換維持）
    renderLine,
    renderSoraLine,
    renderSoraAllLine,
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
