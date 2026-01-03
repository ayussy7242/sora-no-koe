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
    return SIGNS_V1?.signs?.[signKey] || null;
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

  function withSignJaPublic(story, bodyKey) {
    const s = story?.public?.transit_signs?.[bodyKey]?.sign_ja;
    return s ? `（${s}）` : "";
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

    if (ac) return `${left} と ${right} が「${ac}」の質感で触れやすい配置。`;
    return `${left} と ${right} の噛み合い方が動きやすい配置。`;
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

    const poolByElement = {
      fire: [
        "火はあるけど、点火は急がなくていい。",
        "熱を一点に集める前に、余白を残すと綺麗。",
        "勢いより、芯の温度を確かめると落ち着く。",
      ],
      earth: [
        "情報を増やすより、形を整えるほど楽になる。",
        "小さく整えるだけで、輪郭が戻りやすい。",
        "やることを減らすほど、手触りが良くなる。",
      ],
      air: [
        "考えを増やすより、言葉を軽く並べ直すと通る。",
        "整理すると、会話や情報の流れが戻りやすい。",
        "結論を急がず、視点を入れ替えるだけで十分。",
      ],
      water: [
        "反応を説明しなくていい。余韻だけ残してOK。",
        "気持ちはそのまま置くと、自然に沈んでいく。",
        "境界を薄くしすぎず、距離感を整えると楽。",
      ],
      default: [
        "強い接触が少ない分、余白が扱いやすい。",
        "今日は静かな配置。増やさず整えると軽い。",
        "外より内のノイズが減りやすい。",
      ],
    };

    const poolByModality = {
      cardinal: ["始める前の整地が効く。", "最初の一手を小さくするほど綺麗。"],
      fixed: ["守るものを決めると安定する。", "変えない場所があると楽。"],
      mutable: ["微調整で十分。やり直しが軽い。", "流れに合わせて少しだけ変える。"],
      default: [""],
    };

    const dateLocal = story?.meta?.date_local || "";
    const userId = story?.personal?.user_id || "public";
    const seedBase = `${dateLocal}|${userId}|no_contact`;

    const aPool = poolByElement[element] || poolByElement.default;
    const a = pickStable(aPool, seedBase + "|a");

    const bPool = poolByModality[modality] || poolByModality.default;
    const b = pickStable(bPool, seedBase + "|b") || "";

    const head = signJa ? `（月は ${signJa} の空気）` : "";
    return `${head}${head ? " " : ""}${a}${b ? " " + b : ""}`.trim();
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
    const tail = hint ? `（${hint}）` : "";

    return moonSignJa
      ? `【今日の月の位置】\n月は ${moonSignJa}${tail ? " " + tail : ""} を通過中。`
      : `【今日の月の位置】\n月のサインは取得中。`;
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
      return "🌌 わたしのほし（ネイタル一覧）\n\n（まだネイタルが準備中みたい）\n「はじめる」から登録してみてね🕊️";
    }

    const { asc, mc } = pickAnglesFromNatalCache(d);

    if (!Number.isFinite(Number(asc)) || !Number.isFinite(Number(mc))) {
      return [
        "🌌 わたしのほし（ネイタル一覧）",
        "",
        "ASC/MC がまだ見つからなかった🙏",
        "（ネイタル計算結果に ASC/MC を保存する処理が必要）",
        "",
        "※ 天体は出せるけど、座標の要（ASC/MC）が欠けるからここでは止めてる。",
      ].join("\n");
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

    const note =
      "\n※ これは「配置」の一覧です。\n" +
      "※ 意味や解釈は置いていません。\n\n" +
      "星は語る。\n決めるのは、人。";

    return ["🌌 わたしのほし（ネイタル一覧）", "", ...lines, note].join("\n");
  }

  // --------------------
  // LINE v3
  // --------------------
  function renderLine(story) {
    const dateLabel = String(story?.meta?.date_local || "").replaceAll("-", ".");
    const { hasNatal, rows } = getTodayContacts(story);

    const head2 = hasNatal
      ? "【今日の星の配置（あなたの座標と空の構造）】"
      : "【今日の星の配置（空の構造）】";

    const circ = ["①", "②", "③"];

    const lines = rows.map((r, i) => {
      const aJa = fmtAnyJa(r.aKey);
      const bJa = fmtAnyJa(r.bKey);
      const aspJa = fmtAspectJa(r.aspectType);
      const deg = fmtDeg(r.aspectDeg);
      const orb = fmtDeg(r.orb);

      // ✅ 星座（サイン）
      const aSignJa = hasNatal ? r.natalSignJa : (r.aSignJa || publicSignJa(story, r.aKey));
      const bSignJa = hasNatal ? r.transitSignJa : (r.bSignJa || publicSignJa(story, r.bKey));

      const aSign = aSignJa ? `（${aSignJa}）` : "";
      const bSign = bSignJa ? `（${bSignJa}）` : "";

      const title = hasNatal
        ? `${circ[i] || `${i + 1}.`} ネイタル: ${aJa}${aSign} × トランジット: ${bJa}${bSign}｜${aspJa}（${deg}°｜orb ${orb}°）`
        : `${circ[i] || `${i + 1}.`} ${aJa}${aSign} × ${bJa}${bSign}｜${aspJa}（${deg}°｜orb ${orb}°）`;

      const mean = oneLineMeaning({ aKey: r.aKey, bKey: r.bKey, aspectType: r.aspectType });
      return `${title}\n${mean}`;
    });

    const moonLine = buildMoonLine(story);
    const yoin = buildYoinLine(story);
    const noContact = buildNoContactLine(story);

    return [
      `🌌 今日のソラのこえ。｜${dateLabel}`,
      ``,
      head2,
      lines.length ? lines.join("\n\n") : noContact,
      ``,
      moonLine,
      ``,
      `【今日の余韻】`,
      yoin,
      ``,
      `解釈は、あなたのもの。`,
      `星は語る。決めるのは、人。`,
    ].join("\n");
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

    return `🌌 ソラのこえ。
［${dateLabel}｜空の配置］${moonLine}

${skyLines}

余韻：${yoin}
解釈は、あなたのもの。`;
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

    return `🌌 ソラのこえ。｜${dateLabel}

${moonLine}

【空の主な配置】
${skyLines}

【余韻】
${yoin}

解釈は、あなたのもの。
星は語る。決めるのは、人。`;
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
