"use strict";

/**
 * render.js (STABLE / V1-source-of-truth) — Unified (v2026.01+)
 * - dict の V1原本(ASPECTS_V1/PLANETS_V1/POINTS_V1/SIGNS_V1) を直接参照して描画
 * - 互換マップ(BODY_JA/POINT_JA/ASPECT_JA)は保険として残す
 * - 占い化しない（no prediction / no should / no good-bad）
 *
 * ✅ This unified build fixes:
 * - withSignJaPublic 未定義で /stories が落ちる問題を解消
 * - publicSignJa の二重定義を解消（1本化）
 * - transit_signs が無い場合も「経度から星座算出」して X/IG/LINE に星座を付与
 * - buildNoContactLine を日付(+user)で安定（seeded）
 * - 「わたしのほし」: natal_cache からネイタル一覧（ASC/MC必須）を描画
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
    const out = {};
    for (const [k, v] of Object.entries(major)) {
      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora: v?.sora || null,
        feel: Array.isArray(v?.feel) ? v.feel : [],
      };
    }
    // guard (minimum set)
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

    // 1) dictが "leo" 形式（小文字）ならここで取れる
    const byLower = SIGNS_V1?.signs?.[lower];
    if (byLower) return byLower;

    // 2) もし dict が "Leo" 形式（先頭大文字）で持ってる場合
    const byRaw = SIGNS_V1?.signs?.[raw];
    if (byRaw) return byRaw;

    // 3) もし dict が "Leo" じゃなくて "LEO" とか変な形でも保険（キー一覧を舐める）
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

    // dictがあれば優先
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

  // story内の「トランジット経度が入ってそうな場所」から拾う
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

  /**
   * publicSignJa:
   * 1) story.public.transit_signs にあれば最優先
   * 2) 無ければ story 内の経度から星座を算出
   */
  function publicSignJa(story, bodyKey) {
    const direct = story?.public?.transit_signs?.[bodyKey]?.sign_ja;
    if (direct) return direct;

    const lonRaw = getTransitLonFromStory(story, bodyKey);
    const lon = mod360(lonRaw);
    if (!Number.isFinite(lon)) return null;

    const signIndex = Math.floor(lon / 30);
    return signJaFromIndex(signIndex);
  }

  function withSignJaPublic(story, bodyKey) {
    const s = publicSignJa(story, bodyKey);
    return s ? `（${s}）` : "";
  }

  // --------------------
  // seeded randomness (stable by date/user)
  // --------------------
  function hash32(str) {
    // simple FNV-1a
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
  // extract today's contacts
  // --------------------
  function getTodayContacts(story) {
    const personalTop = Array.isArray(story?.personal?.touch_points_top3)
      ? story.personal.touch_points_top3
      : [];
    const publicTop = Array.isArray(story?.public?.sky_top)
      ? story.public.sky_top
      : [];

    const hasNatal = personalTop.length > 0;
    const rows = (hasNatal ? personalTop : publicTop).slice(0, 3);

    const normalized = rows.map((r) => {
      if (hasNatal) {
        return {
          mode: "personal",
          aKey: r.natal_body_or_point,
          bKey: r.transit_body,
          aspectType: r.aspect,
          aspectDeg: r.aspect_deg,
          orb: r.orb_deg,
          natalSignJa: r.natal_sign_ja || null,
          transitSignJa: r.transit_sign_ja || null,
        };
      }
      return {
        mode: "public",
        aKey: r.a,
        bKey: r.b,
        aspectType: r.type,
        aspectDeg: r.aspect_deg,
        orb: r.orb_deg,
        aSignJa: r.a_sign_ja || null,
        bSignJa: r.b_sign_ja || null,
      };
    });

    return { hasNatal, rows: normalized };
  }

  function aspectMix(story, contacts) {
    const orbMax = orbMaxFromStory(story, 6);
    const tally = {};
    for (const c of contacts) {
      const t = c.aspectType;
      if (!t) continue;
      tally[t] = (tally[t] || 0) + weightFromOrb(c.orb, orbMax);
    }
    return Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([type, score]) => ({ type, score }));
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

    if (ac) {
      return RENDER_COPY.MEANING_WITH_ASPECT_CORE(left, right, ac);
    }
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

    // 🔑 seed（日付＋ユーザーで安定）
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


  function buildYoinLine(story) {
    const { rows } = getTodayContacts(story);
    const moonKey = story?.public?.moon?.sign_key || null;
    const s = moonKey ? signMeta(moonKey) : null;

    if (!rows.length) return buildNoContactLine(story);

    const best = [...rows].sort((x, y) => Number(x.orb ?? 999) - Number(y.orb ?? 999))[0];

    const aCore = coreOf(best.aKey);
    const bCore = coreOf(best.bKey);
    const ac = aspectCore(best.aspectType);

    const aJa = fmtAnyJa(best.aKey);
    const bJa = fmtAnyJa(best.bKey);

    const mix = aspectMix(story, rows);
    const topMix = mix?.[0]?.type || null;

    const moonTaste = s?.core || s?.sora_short || null;

    const fragments = [];

    if (aCore && bCore) fragments.push(`${aJa}の「${aCore}」と、${bJa}の「${bCore}」が同じ画面に出やすい。`);
    else fragments.push(`${aJa} と ${bJa} の距離感が動きやすい。`);

    if (ac) fragments.push(`質感は ${fmtAspectJa(best.aspectType)}（${ac}）。`);
    else fragments.push(`質感は ${fmtAspectJa(best.aspectType)}。`);

    if (topMix && topMix !== best.aspectType) {
      const mx = aspectCore(topMix);
      if (mx) fragments.push(`全体は「${mx}」寄り。`);
    }

    if (moonTaste) fragments.push(`背景は「${moonTaste}」。`);

    const line = fragments.join(" ");
    if (line.length > 90) return fragments.slice(0, 2).join(" ");
    return line;
  }

  function buildMoonLine(story) {
    const moon = story?.public?.moon || {};
    const moonSignJa = moon?.sign_ja || null;
    const moonSignKey = moon?.sign_key || null;
    const s = moonSignKey ? signMeta(moonSignKey) : null;

    const hint = s?.core || s?.sora_short || s?.field || null;

    if (moonSignJa) {
      return RENDER_COPY.MOON_LINE_OK(moonSignJa, hint);
    }
    return RENDER_COPY.MOON_LINE_LOADING();

  }

  // --------------------
  // natal list formatter (LINE command: わたしのほし) — ASC/MC 必須
  // --------------------
  function lonToSignDegMin(lonDeg) {
    const x = Number(lonDeg);
    if (!Number.isFinite(x)) return null;

    const lon = ((x % 360) + 360) % 360;
    const signIndex = Math.floor(lon / 30); // 0..11
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

    // fallback: house cusps on top-level
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

    if (!bodies || typeof bodies !== "object") {
      return RENDER_COPY.NATAL_LIST.NOT_READY();
    }

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

  // --------------------
  // LINE v3 (STABLE / Unified)
  // - copyはRENDER_COPYのみ参照（直書きしない）
  // - personal層は重複（touchとhidden等）を除去して表示
  // - 足りない場合も落ちずに自然に出す
  // --------------------
  function renderLine(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const layers = getSkyLayers(story);

    const hasPersonal = !!layers; // sky_layers があれば personal 表示
    const head = hasPersonal ? RENDER_COPY.HEAD_PERSONAL : RENDER_COPY.HEAD_PUBLIC;

    let bodyBlock = "";

    // --- helper: personal TP uniqueness ---
    function tpKey(tp) {
      if (!tp) return "";
      // 最低限同一判定に必要な三要素
      return `${tp.natal_body_or_point || ""}|${tp.transit_body || ""}|${tp.aspect || ""}`;
    }

    if (hasPersonal) {
      const theme0 = layers.theme?.[0] || null;
      const touch = Array.isArray(layers.touch) ? layers.touch : [];
      const hidden0 = layers.hidden?.[0] || null;

      const used = new Set();
      const parts = [];

      // copy 正本（固定文言は render.js に置かない）
      const { HEAD_LAYERS, CIRCLES } = RENDER_COPY;
      // ① Theme（1つ）
      if (theme0) {
        used.add(tpKey(theme0));
        parts.push(
          `${HEAD_LAYERS.THEME}\n` +
          formatPersonalTPLine(story, theme0, `${CIRCLES[0]} `)
        );
      }

      // ②③ Touch（最大2つ）
      if (touch[0]) {
        used.add(tpKey(touch[0]));
        parts.push(
          `${HEAD_LAYERS.TOUCH}\n` +
          formatPersonalTPLine(story, touch[0], `${CIRCLES[1]} `)
        );
      }

      if (touch[1]) {
        used.add(tpKey(touch[1]));
        // 同セクション内で続ける（見出しは付けない）
        parts.push(
          formatPersonalTPLine(story, touch[1], `${CIRCLES[2]} `)
        );
      }

      // Hidden（重複してたら出さない）
      const hidden = hidden0 && !used.has(tpKey(hidden0)) ? hidden0 : null;

      if (hidden) {
        parts.push(
          `${HEAD_LAYERS.HIDDEN}\n` +
          formatPersonalTPLine(story, hidden, "・")
        );
      }

      // もしpersonal層が全部空なら、余白文言へ（落とさない）
      bodyBlock = parts.filter(Boolean).join("\n\n");
      if (!bodyBlock) bodyBlock = buildNoContactLine(story);
    } else {
      // --- public top3 (従来) ---
      const { rows } = getTodayContacts(story);
      const circ = Array.isArray(RENDER_COPY.CIRCLES) ? RENDER_COPY.CIRCLES : ["①", "②", "③"];

      const lines = rows.map((r, i) => {
        const aJa = fmtAnyJa(r.aKey);
        const bJa = fmtAnyJa(r.bKey);

        const aspJa = fmtAspectJa(r.aspectType);
        const deg = fmtDeg(r.aspectDeg);
        const orb = fmtDeg(r.orb);

        const aSignJa = r.aSignJa || publicSignJa(story, r.aKey);
        const bSignJa = r.bSignJa || publicSignJa(story, r.bKey);

        const aSign = aSignJa ? `（${aSignJa}）` : "";
        const bSign = bSignJa ? `（${bSignJa}）` : "";

        const title = `${circ[i] || `${i + 1}.`} ${aJa}${aSign} × ${bJa}${bSign}｜${aspJa}（${deg}°｜orb ${orb}°）`;
        const mean = oneLineMeaning({ aKey: r.aKey, bKey: r.bKey, aspectType: r.aspectType });

        return `${title}\n${mean}`;
      });

      bodyBlock = lines.length ? lines.join("\n\n") : buildNoContactLine(story);
    }

    const moonLine = buildMoonLine(story);
    const yoin = buildYoinLine(story);

    return [
      RENDER_COPY.LINE_TITLE(dateLabel),
      "",
      head,
      "",
      bodyBlock,
      "",
      moonLine,
      "",
      RENDER_COPY.HEAD_YOIN,
      yoin,
      "",
      ...RENDER_COPY.FOOTER_LINE,
    ].join("\n");
  }




  function getSkyLayers(story) {
    const layers = story?.personal?.sky_layers;
    if (!layers) return null;

    const theme = Array.isArray(layers.theme) ? layers.theme : [];
    const touch = Array.isArray(layers.touch) ? layers.touch : [];
    const hidden = Array.isArray(layers.hidden) ? layers.hidden : [];

    return { theme, touch, hidden };
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




  // --------------------
  // X / IG
  // --------------------
  function renderX(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const sky = story?.public?.sky_top || [];
    const moonSign = story?.public?.moon?.sign_ja || null;

    const skyLines = sky.length
      ? sky
        .map((s, i) => {
          const a = fmtBodyJa(s.a);
          const b = fmtBodyJa(s.b);
          const aSign = withSignJaPublic(story, s.a);
          const bSign = withSignJaPublic(story, s.b);
          return `${i + 1}) ${a}${aSign} × ${b}${bSign}｜${fmtAspectJa(s.type)}（orb ${fmtDeg(s.orb_deg)}°）`;
        })
        .join("\n")
      : buildNoContactLine(story);

    const moonLine = moonSign ? `\n月は ${moonSign} を通過中。` : "";
    const yoin = buildYoinLine(story);

    return RENDER_COPY.X_FORMAT.BLOCK({
      dateLabel,
      moonLine,
      skyLines,
      yoin,
    });
  }


  function renderIG(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const moonSign = story?.public?.moon?.sign_ja || null;
    const sky = story?.public?.sky_top || [];

    const skyLines = sky.length
      ? sky
        .map((s) => {
          const a = fmtBodyJa(s.a);
          const b = fmtBodyJa(s.b);
          const aSign = withSignJaPublic(story, s.a);
          const bSign = withSignJaPublic(story, s.b);
          return `・${a}${aSign} × ${b}${bSign}｜${fmtAspectJa(s.type)}（orb ${fmtDeg(s.orb_deg)}°）`;
        })
        .join("\n")
      : `・${buildNoContactLine(story)}`;

    const moonLine = moonSign ? `月は ${moonSign} を通過中。` : "月のサインは取得中。";
    const yoin = buildYoinLine(story);

    return RENDER_COPY.IG_FORMAT.BLOCK({
      dateLabel,
      moonLine,
      skyLines,
      yoin,
    });
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
