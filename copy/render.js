"use strict";

/**
 * copy/render.js — 正本（Render Copy） Unified v3.3.3/3.3.4 compatible
 * - render.js が出す「固定文言」をここに集約（copyが正）
 * - トンマナ統一：「占いじゃない／構造を置く／解釈はあなた」
 * - personal（今日）と public（そら）を “copy段” で分離
 * - render.js は “組み立て” だけ（判断しない）
 */

// --------------------
// Base constants（自己参照禁止のため先に定数化）
// --------------------

const { TP_ITEM_V1 } = require("../dict/tp_item.v1");

const BRAND = "ソラのこえ。";

// --- personal（今日）側 ---
const HEAD_TODAY = "【今日の星（あなたの星×今日のソラ）】";
const HEAD_SKY = "【今日のソラ（星の配置）】"; // 互換用（残す）
const HEAD_SKY_MAIN = "【星の主な配置】";
const HEAD_moon = "【今日の月】";
const HEAD_YOIN = "【今日の余韻】";
const HEAD_NATAL_LIST = "🌌 わたしのほし（あなたの星の一覧）";

// --- public（そら）側 ---
const HEAD_SORA = "【今日のソラ｜そら】";
const HEAD_SORA_SKY = "【今日のソラの配置】";
const HEAD_SORA_SKY_TOP5 = "【今日のソラの配置 上位5共鳴（orb≤6°）】";
const HEAD_SORA_SKY_ALL = "【今日のソラの配置 全部（orb≤6°）】";
const HEAD_DIST = "【分布（エレメント／三区分）】";
const HEAD_KUSOU = "【空層】";
const HEAD_KUSOU_YOIN = "";

// v3.3: 詳細版「空層の余韻」を出したい時だけON（空文字なら render.js 側で出ない）
const HEAD_YOIN_GLOBAL = "";

// footer
const FOOTER_LINE = ["解釈は、あなたのもの。", "星は語る。決めるのは、人。🌎️🛸✨️"];
const FOOTER_X = "星は語る。🌎🛸";
const FOOTER_IG = FOOTER_LINE.join("\n");

// titles
const LINE_TITLE = (dateLabel) => `🌌 今日のソラのこえ。｜${dateLabel}`;
const LINE_SORA_TITLE = (dateLabel) => `🌌 今日のソラ｜そら｜${dateLabel}`;

// ✅ 配信① CTA（末尾導線）
const LINE_MAIN_CTA = [
  "──",
  " ",
  "必要な人は、次に",
  "「そら」",
  "と送ってみてね。 ",
  "今日のソラの配置一覧が出るよ🌌",
].join("\n");

// --------------------
// tiny helpers（改行が消えないテンプレ合成）
// --------------------
function pushLine(arr, v) {
  if (v === null || v === undefined) return;
  arr.push(String(v));
}
function pushBlank(arr, n = 1) {
  for (let i = 0; i < n; i++) arr.push("");
}
function pushLines(arr, lines) {
  if (lines === null || lines === undefined) return;
  if (Array.isArray(lines)) {
    lines.forEach((l) => pushLine(arr, l));
    return;
  }
  pushLine(arr, lines);
}
function trimEndBlanks(lines) {
  const out = Array.isArray(lines) ? lines.slice() : [];
  while (out.length && String(out[out.length - 1]) === "") out.pop();
  return out;
}
function normalizeJoin(lines) {
  // 空行は「残す」。ただし末尾の空行だけ削る。
  return trimEndBlanks(lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --------------------
// Render Copy
// --------------------
const RENDER_COPY = Object.freeze({
  // --------------------
  // Brand / Titles
  // --------------------
  BRAND_LINE: BRAND,
  BRAND_X: BRAND,
  BRAND_IG: BRAND,

  LINE_TITLE,
  LINE_SORA_TITLE,
  X_TITLE: () => `🌌 ${BRAND}`,
  IG_TITLE: (dateLabel) => `🌌 ${BRAND}｜${dateLabel}`,

  LINE_MAIN_CTA,

  // --------------------
  // Section Heads
  // --------------------
  HEAD_TODAY,
  HEAD_SKY,
  HEAD_SKY_MAIN,
  HEAD_moon,
  HEAD_YOIN,
  HEAD_NATAL_LIST,

  // public heads
  HEAD_SORA,
  HEAD_SORA_SKY,
  HEAD_SORA_SKY_TOP5,
  HEAD_SORA_SKY_ALL,
  HEAD_DIST,
  HEAD_KUSOU,
  HEAD_KUSOU_YOIN,
  HEAD_YOIN_GLOBAL,

  // --------------------
  // Footer / Philosophy
  // --------------------
  FOOTER_LINE,
  FOOTER_X,
  FOOTER_IG,

  // public footer（そら用）
  // ⚠️ ここに「解釈は、あなたのもの。」を入れると、
  // buildSora() 側で kusouYoin セクションにも入れる場合、重複する。
  // → “重複回避”のため、基本は footer には入れない版をデフォにする。
  FOOTER_SORA_LINE: ["星は語る。決めるのは、人。", "そらとして、眺めてみてね。🌌"],

  // --------------------
  // Generic small bits
  // --------------------
  CIRCLES: ["①", "②", "③"],
  ORB_LABEL: (orb) => `orb ${orb}°`,
  DEG_LABEL: (deg, orb) => `（${deg}°｜orb ${orb}°）`,
  YOIN_PREFIX_X: "余韻：",

  // --------------------
  // Meaning line templates（占い化しない／断定しない）
  // --------------------
  MEANING_WITH_ASPECT_CORE: (left, right, aspectCore) =>
    `${left} と \n${right} が\n「${aspectCore}」の質感で触れやすい配置。`,
  MEANING_NO_ASPECT_CORE: (left, right) => `${left} と \n${right} の\n噛み合い方が動きやすい配置。`,

  // --------------------
  // moon line
  // --------------------
  moon_LINE_OK: (moonSignJa, hintOrNull) =>
    hintOrNull
      ? `${HEAD_moon}\n月は ${moonSignJa}（${hintOrNull}） を通過中。`
      : `${HEAD_moon}\n月は ${moonSignJa} を通過中。`,
  moon_LINE_LOADING: () => `${HEAD_moon}\n月のサインは取得中。`,

  // --------------------
  // No-contact pools（接触少ない日の“余白”）
  // --------------------
  NO_CONTACT: {
    byElement: {
      fire: ["火はあるけど、点火は急がなくていい。", "熱を一点に集める前に、余白を残すと綺麗。", "勢いより、芯の温度を確かめると落ち着く。"],
      earth: ["情報を増やすより、形を整えるほど楽になる。", "小さく整えるだけで、輪郭が戻りやすい。", "やることを減らすほど、手触りが良くなる。"],
      air: ["考えを増やすより、言葉を軽く並べ直すと通る。", "整理すると、会話や情報の流れが戻りやすい。", "結論を急がず、視点を入れ替えるだけで十分。"],
      water: ["反応を説明しなくていい。余韻だけ残してOK。", "気持ちはそのまま置くと、自然に沈んでいく。", "境界を薄くしすぎず、距離感を整えると楽。"],
      default: ["強い接触が少ない分、余白が扱いやすい。", "今日は静かな配置。増やさず整えると軽い。", "外より内のノイズが減りやすい。"],
    },

    byModality: {
      cardinal: ["始める前の整地が効く。", "最初の一手を小さくするほど綺麗。"],
      fixed: ["守るものを決めると安定する。", "変えない場所があると楽。"],
      mutable: ["微調整で十分。やり直しが軽い。", "流れに合わせて少しだけ変える。"],
      default: [""],
    },

    headmoonTaste: (moonSignJa) => (moonSignJa ? `（月は ${moonSignJa} の空気）` : ""),
    glue: (head, a, b) => {
      const h = head ? `${head} ` : "";
      const bb = b ? ` ${b}` : "";
      return `${h}${a}${bb}`.trim();
    },
  },

  // --------------------
  // Today layers（personal-only：3層ラベル）
  // --------------------
  HEAD_LAYERS: {
    THEME: "",
    TOUCH: "",
    HIDDEN: "",
  },

  // --------------------
  // Distribution（public-only：分布行テンプレ）
  // ✅ 方針B：表示Nなら「両端カウント」で計=2N に統一
  // --------------------
  DIST: {
    ELEMENT_LINE_ENDPOINTS: (e) =>
      `惑星の出方：火${e.fire || 0} 地${e.earth || 0} 風${e.air || 0} 水${e.water || 0}（計${e.total || 0}）`,
    MODALITY_LINE_ENDPOINTS: (m) =>
      `三区分：活動${m.cardinal || 0} 不動${m.fixed || 0} 柔軟${m.mutable || 0}（計${m.total || 0}）`,

    // 互換（残す）
    ELEMENT_LINE: (e) => `惑星属性：火${e.fire || 0} 地${e.earth || 0} 風${e.air || 0} 水${e.water || 0}`,
    ELEMENT_LINE_EMOJI: (e) => `惑星属性：🔥火${e.fire || 0} 🪨地${e.earth || 0} 💨風${e.air || 0} 💧水${e.water || 0}`,
    MODALITY_LINE: (m) => `三区分：活動${m.cardinal || 0} 不動${m.fixed || 0} 柔軟${m.mutable || 0}`,
    MODALITY_LINE_EMOJI: (m) => `三区分：🏃活動${m.cardinal || 0} 🧱不動${m.fixed || 0} 🌿柔軟${m.mutable || 0}`,
  },

  // --------------------
  // Labels
  // --------------------
  LABELS: {
    NATAL: "ネイタル：",
    TRANSIT: "トランジット：",
  },

  // --------------------
  // Natal list copy
  // --------------------
  NATAL_LIST: {
    NOT_READY: () =>
      [HEAD_NATAL_LIST, "", "（まだ準備中みたい）", "LINEで「はじめる」から登録してね🕊️"].join("\n"),

    MISSING_ANGLES: () =>
      [
        HEAD_NATAL_LIST,
        "",
        "ASC/MC がまだ見つからなかった🙏",
        "（ネイタル計算結果に ASC/MC を保存する処理が必要）",
        "",
        "※ 天体は出せるけど、座標の要（ASC/MC）が欠けるのでここでは止めてる。",
      ].join("\n"),

    NOTE: () =>
      ["", "※ これは「星の配置」の一覧です。", "※ 意味や解釈は置いていません。", "", "星は語る。", "決めるのは、人。🌎️🛸✨️"].join("\n"),
  },

  // --------------------
  // Yoin（余韻：短文） personal向け
  // --------------------
  YOIN: {
    FALLBACK: "空の密度が少し上がる日。",

    ELEMENT_PHRASE: {
      fire: "熱が立ち上がりやすい空。",
      earth: "現実に落とし込む圧が出やすい空。",
      air: "情報と会話が動きやすい空。",
      water: "感情と余韻が浸透しやすい空。",
      mixed: "要素が混ざって、決めすぎなくていい空。",
    },

    MODALITY_PHRASE: {
      cardinal: "動かす方向へ傾きやすい",
      fixed: "保つ／固める方向へ寄りやすい",
      mutable: "切り替え／揺らす方向へ流れやすい",
      mixed: "ペース配分で形が変わりやすい",
    },

    ELEMENT_SHORT: {
      fire: ["熱は立ち上がりやすい", "火が前に出やすい", "勢いが先に来やすい"],
      earth: ["現実は落ちやすい", "手応えが先に残りやすい", "形が固まりやすい"],
      air: ["言葉は動きやすい", "情報が回りやすい", "対話が生まれやすい"],
      water: ["余韻は浸透しやすい", "感情がにじみやすい", "共鳴が残りやすい"],
      mixed: ["層は混ざりやすい", "境目が曖昧になりやすい", "要素が行き来しやすい"],
    },

    MODALITY_SHORT: {
      cardinal: ["動かす方向へ傾きやすい", "起点が前に出やすい", "切り出しが早まりやすい"],
      fixed: ["輪郭は固まりやすい", "保つ方向へ寄りやすい", "維持が強まりやすい"],
      mutable: ["切り替わりやすい", "揺らぎが出やすい", "流動が起きやすい"],
      mixed: ["ペース配分で形が変わりやすい", "揺れ幅が調整されやすい", "行き来が起きやすい"],
    },

    TAIL_POOL_1: [
      "今日の理解は、あとで追いつくかもしれない。",
      "言葉にしなくても、構造は残る。",
      "決めなくていいまま、置いておける日。",
      "動いてもいい。動かなくても、壊れない。",
      "答えより、手触りを持ち帰る。",
      "意味づけは、あなたのタイミングで。",
    ],

    TAIL_POOL_2: ["先に身体、あとで言葉。", "焦点を変えるだけで、景色が変わる日。", "余白を残して、次に渡す。", "今日は“結論”じゃなくて“残響”で十分。", "これでいい、を急がない。"],

    BUILD: ({ topElement, topModality, aspectLabel, seedBase, pickStable } = {}) => {
      const elementJa = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合", unknown: "未判定" };
      const modalityJa = { cardinal: "活動", fixed: "不動", mutable: "柔軟", mixed: "混合", unknown: "未判定" };

      const layer = `${elementJa[topElement] || "混合"}×${modalityJa[topModality] || "混合"}`;

      const pool = Array.isArray(RENDER_COPY?.YOIN_GLOBAL?.TAIL_POOL) ? RENDER_COPY.YOIN_GLOBAL.TAIL_POOL : [];
      const tail =
        typeof pickStable === "function" && seedBase && pool.length
          ? pickStable(pool, seedBase + "|tail")
          : "結論より、配置。";

      const ePool = RENDER_COPY.YOIN.ELEMENT_SHORT[topElement] || "層は混ざりやすい";
      const mPool = RENDER_COPY.YOIN.MODALITY_SHORT[topModality] || "形が変わりやすい";

      const pickFrom = (pool, key) => {
        if (Array.isArray(pool) && typeof pickStable === "function" && seedBase) {
          return pickStable(pool, `${seedBase}|${key}`);
        }
        return Array.isArray(pool) ? pool[0] : String(pool);
      };

      const e = pickFrom(ePool, "element");
      const m = pickFrom(mPool, "modality");

      const lines = [
        `${HEAD_KUSOU}${layer}。`,
        tail,
        `${e}、${m}。`,
        aspectLabel ? `${aspectLabel} 寄り。` : "",
      ].filter(Boolean);

      return lines.join("\n");
    },

    GLUE: (globalText, centerText) => {
      const g = String(globalText || "").trim();
      const c = String(centerText || "").trim();
      if (!g && !c) return "";
      if (!g) return c;
      if (!c) return g;
      return `${g}\n${c}`;
    },
  },

  // --------------------
  // Yoin Global（空層） public/personal共通で使える「空層1行」を生成
  // ✅「空層：」「中心は：」を抜く（ラベル重複＆重さ回避）
  // --------------------
  YOIN_GLOBAL: {
    TAIL_POOL: ["空は“結論”より“配置”を残す。", "強さは、派手さじゃなく配分で決まる。", "今日は層が厚い。言葉はあとで追いつく。", "同じ現象でも、受け取り方は何層もある。", "静かに、編み直せる日。"],

    BUILD_SHORT: ({ topElement, topModality, seedBase, pickStable } = {}) => {
      const elementJa = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合", unknown: "未判定" };
      const modalityJa = { cardinal: "活動", fixed: "不動", mutable: "柔軟", mixed: "混合", unknown: "未判定" };

      const layer = `${elementJa[topElement] || "混合"}×${modalityJa[topModality] || "混合"}`;

      const pool = Array.isArray(RENDER_COPY?.YOIN_GLOBAL?.TAIL_POOL) ? RENDER_COPY.YOIN_GLOBAL.TAIL_POOL : [];
      const tail =
        typeof pickStable === "function" && seedBase && pool.length
          ? pickStable(pool, seedBase + "|tail")
          : "";

      // ✅ 例）「地×不動。静かに、編み直せる日。」
      // tailが空なら「地×不動。」で止まるのが嫌なので、最低でも一言は出す
      const safeTail = tail || "静かに、編み直せる日。";

      // “空層：”は付けない（HEAD_KUSOU_YOIN が役割を持つ）
      return `${layer}。${safeTail}`.trim();
    },

    BUILD_DETAIL: ({ story, seedBase, pickStable, buildYoinGlobal }) => {
      const short =
        typeof buildYoinGlobal === "function"
          ? buildYoinGlobal(story, { compact: false, maxContacts: 12, minWeight: 0.10 })
          : "";

      const pool = Array.isArray(RENDER_COPY?.YOIN_GLOBAL?.TAIL_POOL) ? RENDER_COPY.YOIN_GLOBAL.TAIL_POOL : [];
      const tail =
        typeof pickStable === "function" && seedBase && pool.length
          ? pickStable(pool, seedBase + "|detail_tail")
          : "";

      return [short, tail].filter(Boolean).join("\n");
    },
  },

  // --------------------
  // X formatting（copy-driven）
  // --------------------
  X_FORMAT: {
    TITLE_LINE: (dateLabel) => `🌌 ${dateLabel}｜今日のソラ`,
    moon_LINE: (moonSignJa) => (moonSignJa ? `🌙月: ${moonSignJa}` : ""),

    SKY_LINE: ({ emoji = "☄️", aLabel, aSignJa, bLabel, bSignJa, aspectJa, orb }) => {
      const aSign = aSignJa ? ` ${aSignJa}` : "";
      const bSign = bSignJa ? ` ${bSignJa}` : "";
      const o = typeof orb === "number" ? orb.toFixed(1) : String(orb);
      return `${emoji}${aLabel}${aSign} ×${bLabel}${bSign}｜${aspectJa} ${o}°`;
    },

    SECRET_LINE: ({ aLabel, aSignJa, bLabel, bSignJa, aspectJa, orb }) =>
      RENDER_COPY.X_FORMAT.SKY_LINE({
        emoji: "🪐",
        aLabel,
        aSignJa,
        bLabel,
        bSignJa,
        aspectJa,
        orb,
      }),
  },

  // --------------------
  // IG formatting（copy-driven）
  // --------------------
  IG_FORMAT: {
    moon_LINE_OK: (moonSignJa) => (moonSignJa ? `月は ${moonSignJa} を通過中。` : "月のサインは取得中。"),
    SKY_LINE_NUM: (i, a, aSign, b, bSign) => `${i}) ${a}${aSign} × ${b}${bSign}`,
    SKY_LINE_ASPECT: (aspectJa, orb) => `${aspectJa}（orb ${orb}°）`,

    MEANING_BLOCK: ({ aLabel, aCore, bLabel, bCore, tone, aspectCoreText }) => {
      const t = tone ? `「${tone}」空気の中で、` : "";
      return (`${aLabel}（${aCore || "—"}）と、\n` + `${bLabel}（${bCore || "—"}）が、\n\n` + (t ? `${t}\n` : "") + `${aspectCoreText || "—"}。`).replaceAll("\n\n\n", "\n\n");
    },

    SECRET_HEAD: "ひそかな配置",
  },

  TP: {
    COPY_SIGN_FIELD: TP_ITEM_V1.COPY_SIGN_FIELD,
    COPY_PLANET_ACTION: TP_ITEM_V1.COPY_PLANET_ACTION,
    SUMMARY_BY_ASPECT: TP_ITEM_V1.SUMMARY_BY_ASPECT,

    HEADER: ({ i, aLabel, aSignJa, bLabel, bSignJa, aspectJa, deg, orb }) =>
      `${i} ネイタル：${aLabel}${aSignJa ? `（${aSignJa}）` : ""} × トランジット：${bLabel}${bSignJa ? `（${bSignJa}）` : ""} ｜ ${aspectJa}（${deg}°｜orb ${orb}°）`,

    BODY_LINE: ({ signJa, bodyJa, field, action }) => `${signJa}の${bodyJa}：${field}の領域で、${action}`,

    BUILD_ITEM: ({ header, aLine, bLine, summary }) => [header, aLine, bLine, summary].filter(Boolean).join("\n"),
  },

  // --------------------
  // Templates (LINE)
  // - 改行ルールをここで統一（空行は残す）
  // --------------------
  TPL: {
    LINE: {
      // ✅ 配信①（main）
      buildMain: ({ dateLabel, parts, kusouYoin, footerLines, cta }) => {
        const out = [];

        pushLine(out, RENDER_COPY.LINE_TITLE(dateLabel));
        pushBlank(out, 1);

        pushLine(out, RENDER_COPY.HEAD_TODAY);
        pushBlank(out, 1);

        pushLine(out, parts);
        pushBlank(out, 1);

        if (RENDER_COPY.HEAD_KUSOU_YOIN) pushLine(out, RENDER_COPY.HEAD_KUSOU_YOIN);
        pushLine(out, kusouYoin);
        pushBlank(out, 1);

        pushLines(out, footerLines || RENDER_COPY.FOOTER_LINE);
        pushBlank(out, 1);

        pushLine(out, cta || RENDER_COPY.LINE_MAIN_CTA);

        return normalizeJoin(out);
      },

      // ✅ 配信②（sora）
      // - listTitle で「上位5」「全部」を切り替え可能（render側から渡してOK）
      // - 解釈文言は kusou セクションで一回だけ入れる（重複回避）
      buildSora: ({ dateLabel, mainLines, moonLine, distLines, kusouYoin, footerLines, listTitle }) => {
        const lines = [];

        // タイトル
        pushLine(lines, RENDER_COPY.LINE_SORA_TITLE(dateLabel));
        pushBlank(lines, 1);

        // 配置見出し（上位5 or 全部）
        const headSky = listTitle ? String(listTitle) : RENDER_COPY.HEAD_SORA_SKY; // デフォ
        pushLine(lines, headSky);
        if (mainLines) pushLine(lines, mainLines);
        pushBlank(lines, 1);

        // 月
        if (moonLine) {
          pushLine(lines, moonLine);
          pushBlank(lines, 1);
        }

        // 分布（ここは “見出しなし” でもOK。必要なら HEAD_DIST を復活）
        if (distLines) {
          pushLine(lines, distLines);
          pushBlank(lines, 1);
        }

        // 空層/余韻
        if (kusouYoin) {
          if (RENDER_COPY.HEAD_KUSOU_YOIN) pushLine(lines, RENDER_COPY.HEAD_KUSOU_YOIN);
          pushLine(lines, kusouYoin);
          pushLine(lines, "解釈は、あなたのもの。");
          pushBlank(lines, 1);
        }

        // フッター
        pushLines(lines, footerLines || RENDER_COPY.FOOTER_SORA_LINE);

        return normalizeJoin(lines);
      },
    },
  },
});

module.exports = { RENDER_COPY };
