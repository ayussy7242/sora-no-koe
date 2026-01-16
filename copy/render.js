"use strict";

/**
 * copy/render.js — 正本（Render Copy）
 * - render.js が出す「固定文言」をここに集約
 * - トンマナ統一：「占いじゃない／構造を置く／解釈はあなた」
 * - 用語統一：「あなたの星」「今日のソラ」「今日の星（あなたの星×今日のソラ）」
 * - render.js は “組み立て” だけ（判断しない）
 */

const RENDER_COPY = Object.freeze({
    // --------------------
    // Brand / Titles
    // --------------------
    BRAND_LINE: "ソラのこえ。",
    BRAND_X: "ソラのこえ。",
    BRAND_IG: "ソラのこえ。",

    LINE_TITLE: (dateLabel) => `🌌 今日のソラのこえ。｜${dateLabel}`,
    X_TITLE: () => `🌌 ソラのこえ。`,
    IG_TITLE: (dateLabel) => `🌌 ソラのこえ。｜${dateLabel}`,

    // --------------------
    // Section Heads（用語統一）
    // --------------------
    HEAD_TODAY: "【今日の星（あなたの星×今日のソラ）】",
    HEAD_SKY: "【今日のソラ（星の配置）】",
    HEAD_SKY_MAIN: "【星の主な配置】",
    HEAD_MOON: "【今日の月】",
    HEAD_YOIN: "【今日の余韻】",
    HEAD_NATAL_LIST: "🌌 わたしのほし（あなたの星の一覧）",

    // --------------------
    // Footer / Philosophy
    // --------------------
    FOOTER_LINE: ["解釈は、あなたのもの。", "星は語る。決めるのは、人。🌎️🛸✨️"],
    FOOTER_X: "解釈は、あなたのもの。🌎️🛸✨️",
    FOOTER_IG: ["解釈は、あなたのもの。", "星は語る。決めるのは、人。🌎️🛸✨️"].join("\n"),

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
        `${left} と ${right} が「${aspectCore}」の質感で触れやすい配置。`,
    MEANING_NO_ASPECT_CORE: (left, right) =>
        `${left} と ${right} の噛み合い方が動きやすい配置。`,

    // --------------------
    // Moon line
    // --------------------
    MOON_LINE_OK: (moonSignJa, hintOrNull) =>
        hintOrNull
            ? `${RENDER_COPY.HEAD_MOON}\n月は ${moonSignJa}（${hintOrNull}） を通過中。`
            : `${RENDER_COPY.HEAD_MOON}\n月は ${moonSignJa} を通過中。`,
    MOON_LINE_LOADING: () => `${RENDER_COPY.HEAD_MOON}\n月のサインは取得中。`,

    // --------------------
    // No-contact pools（接触少ない日の“余白”）
    // --------------------
    NO_CONTACT: {
        byElement: {
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
        },

        byModality: {
            cardinal: ["始める前の整地が効く。", "最初の一手を小さくするほど綺麗。"],
            fixed: ["守るものを決めると安定する。", "変えない場所があると楽。"],
            mutable: ["微調整で十分。やり直しが軽い。", "流れに合わせて少しだけ変える。"],
            default: [""],
        },

        headMoonTaste: (moonSignJa) => (moonSignJa ? `（月は ${moonSignJa} の空気）` : ""),
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
        THEME: "【今日の中心（触れやすい場所）】",
        TOUCH: "【引っかかりやすい接点】",
        HIDDEN: "【ひそやかな接点】",
    },

    // --------------------
    // Rare aspects（見つかった日だけ）
    // --------------------
    RARE: {
        HEAD: "【🧩 レア共鳴（見つかった日だけ）】",

        LABEL: {
            quincunx_150: "インコンジャンクト",
            quintile_72: "クインタイル",
            biquintile_144: "バイクインタイル",
            semi_sextile_30: "セミセクスタイル",
            semi_square_45: "セミスクエア",
            sesqui_square_135: "セスキスクエア",
        },

        CORE: {
            quincunx_150: "性質が違って、自然に噛み合いにくい配置（調整ポイントが浮かびやすい）。",
            quintile_72: "工夫や創造の回路が立ち上がりやすい配置（意識すると活かしやすい）。",
            biquintile_144: "創造の反復・熟成がテーマになりやすい配置（繰り返しで形になりやすい）。",
            semi_sextile_30: "気配レベルの接点が生まれやすい配置（ほぼ無意識に反応することも）。",
            semi_square_45: "小さな摩擦・微調整が起きやすい配置（些細なズレとして出ることも）。",
            sesqui_square_135: "蓄積した摩擦が表に出やすい配置（方向転換の合図として現れることも）。",
        },

        LINE: ({ a, aSign, b, bSign, aspectLabel, orb }) =>
            `・${a}${aSign} × ${b}${bSign}｜${aspectLabel}（orb ${orb}°）`,

        MEANING: (aspectKey) => RENDER_COPY.RARE.CORE?.[aspectKey] || "",
    },

    // --------------------
    // Natal list copy
    // --------------------
    NATAL_LIST: {
        NOT_READY: () =>
            [
                RENDER_COPY.HEAD_NATAL_LIST,
                "",
                "（まだ準備中みたい）",
                "LINEで「はじめる」から登録してね🕊️",
            ].join("\n"),

        MISSING_ANGLES: () =>
            [
                RENDER_COPY.HEAD_NATAL_LIST,
                "",
                "ASC/MC がまだ見つからなかった🙏",
                "（ネイタル計算結果に ASC/MC を保存する処理が必要）",
                "",
                "※ 天体は出せるけど、座標の要（ASC/MC）が欠けるのでここでは止めてる。",
            ].join("\n"),

        NOTE: () =>
            [
                "",
                "※ これは「星の配置」の一覧です。",
                "※ 意味や解釈は置いていません。",
                "",
                "星は語る。",
                "決めるのは、人。🌎️🛸✨️",
            ].join("\n"),
    },

    // --------------------
    // Optional guide（意味不明ワードを排除）
    // --------------------
    GUIDE: {
        SKY_ONLY_HINT: () =>
            "\n\n（「今日」は、登録があると “あなたの星×今日のソラ” が見られる🌌\n登録は LINEで「はじめる」）",
    },

    // --------------------
    // Labels
    // --------------------
    LABELS: {
        NATAL: "ネイタル：",
        TRANSIT: "トランジット：",
    },

    // --------------------
    // Yoin（短く、気持ち悪くならない断定回避）
    // --------------------
    YOIN: {
        FALLBACK: "空の密度が少し上がる日。",

        ELEMENT_PHRASE: {
            fire: "熱が立ち上がりやすい空。",
            earth: "現実に落とし込む圧が出やすい空。",
            air: "情報と会話が動きやすい空。",
            water: "感情と余韻が浸透しやすい空。",
        },

        MODALITY_PHRASE: {
            cardinal: "動かす方向へ傾きやすい",
            fixed: "保つ／固める方向へ寄りやすい",
            mutable: "切り替え／揺らす方向へ流れやすい",
        },

        BUILD: ({ topElement, topModality, aspectLabel, aspectCoreText } = {}) => {
            const head =
                (topElement && RENDER_COPY.YOIN.ELEMENT_PHRASE[topElement]) ||
                RENDER_COPY.YOIN.FALLBACK;

            const tailBits = [];
            if (topModality && RENDER_COPY.YOIN.MODALITY_PHRASE[topModality]) {
                tailBits.push(RENDER_COPY.YOIN.MODALITY_PHRASE[topModality]);
            }
            if (aspectCoreText) tailBits.push(`質感は「${aspectCoreText}」寄り`);
            else if (aspectLabel) tailBits.push(`質感は ${aspectLabel} 寄り`);

            // ✅ 句点でつなぐ（スペース残さない）
            const tail = tailBits.length ? `${tailBits.join("、")}。` : "";

            const out = `${head}${tail ? ` ${tail}` : ""}`.trim();

            // ✅ 長文化防止
            if (out.length > 90) return head;

            // ✅ 念のため：句点の後の余計な空白を消す
            return out.replace(/。\s+/g, "。").trim();
        },

    },

    // --------------------
    // X formatting（compact template / CLEAN）
    // --------------------
    X_FORMAT: {
        // 🌌 2026.01.15｜今日のソラ
        TITLE_LINE: (dateLabel) => `🌌 ${dateLabel}｜今日のソラ`,

        // 月：射手座
        MOON_LINE: (moonSignJa) => (moonSignJa ? `月：${moonSignJa}` : ""),

        // ☄️金星 山羊座 ×土星 魚座｜セクスタイル 0.2°
        SKY_LINE: ({ emoji = "☄️", aLabel, aSignJa, bLabel, bSignJa, aspectJa, orb }) => {
            const aSign = aSignJa ? ` ${aSignJa}` : "";
            const bSign = bSignJa ? ` ${bSignJa}` : "";
            const o = typeof orb === "number" ? orb.toFixed(1) : String(orb);
            return `${emoji}${aLabel}${aSign} ×${bLabel}${bSign}｜${aspectJa} ${o}°`;
        },

        // 🌙月 射手座 ×木星 蟹座｜バイクインタイル 0.1°
        SECRET_LINE: ({ aLabel, aSignJa, bLabel, bSignJa, aspectJa, orb }) =>
            RENDER_COPY.X_FORMAT.SKY_LINE({
                emoji: "🌙",
                aLabel,
                aSignJa,
                bLabel,
                bSignJa,
                aspectJa,
                orb,
            }),

        // 余韻は最大2文まで
        YOIN_LINES_2: (yoin) => {
            let s = String(yoin || "").trim();
            if (!s) return "";

            // 改行はスペース化
            s = s.replace(/\s+/g, " ");

            // 句点優先で分割。なければ区切り記号でも分割。
            let parts = s.split("。").map(x => x.trim()).filter(Boolean);
            if (parts.length < 2) {
                parts = s.split(/[｜/]/).map(x => x.trim()).filter(Boolean);
            }
            if (parts.length < 2) {
                parts = s.split("、").map(x => x.trim()).filter(Boolean);
            }

            const top2 = parts.slice(0, 2).join("。");
            const out = top2 ? `${top2}。` : s;

            // 最終安全弁：長すぎたら文字数でカット
            return out.length > 130 ? out.slice(0, 127) + "…" : out;
        },

        // キーワード（必要なときだけ）
        KEYWORDS_LINE: (keywords) => {
            const arr = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
            if (!arr.length) return "";
            return `${arr.join("/")}。`;
        },

        _yoinContainsKeywords: (yoin, keywords) => {
            const s = String(yoin || "");
            const arr = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
            if (!s || !arr.length) return false;
            return arr.every((k) => s.includes(k));
        },

        // 【主役】/【影】の見出し
        ROLE_HEAD_MAIN: "【主役】",
        ROLE_HEAD_SHADOW: "【影】",

        // 主役の一言（→の行）
        // 例: → 思考と拡大が、現実の場で向き合う
        MAIN_ARROW: (s) => (s ? `→ ${String(s).trim()}` : ""),

        // 締め（毎回固定）
        CLOSE_LINES: ["空気は一方向じゃない。", "読む場所は、選んでいい。", "", "星は語る。🌎🛸"],

        CLOSE_LINES_POOL: [
            ["切り替えていい。", "今日は今日の速度がある。", "", "星は語る。🌎🛸"],
            ["動いてもいい。", "動かなくても、進んでいる。", "", "星は語る。🌎🛸"],
            ["言葉にしなくてもいい。", "感じた時点で、もう受信してる。", "", "星は語る。🌎🛸"],
            ["視野は、広げてもいい。", "縮めても、間違いじゃない。", "", "星は語る。🌎🛸"],
            ["誰かとでも、ひとりでも。", "今日はどちらでも成立する。", "", "星は語る。🌎🛸"],
            ["意味を探さなくていい。", "感覚が先に来る日もある。", "", "星は語る。🌎🛸"],
            ["静かでいい。", "回収するだけの日も、必要。", "", "星は語る。🌎🛸"],
        ],

        // 主役/影フォーマット本体
        BLOCK_ROLE: ({ dateLabel, moonSignJa, mainLine, mainArrow, shadowLines = [], yoinShort, closeLines }) => {
            const lines = [];
            lines.push(`🌌 ${dateLabel}｜空の配置`);
            if (moonSignJa) lines.push(`月：${moonSignJa}`);

            lines.push("");
            lines.push(RENDER_COPY.X_FORMAT.ROLE_HEAD_MAIN);
            lines.push(mainLine);
            if (mainArrow) lines.push(mainArrow);

            if (shadowLines.length) {
                lines.push("");
                lines.push(RENDER_COPY.X_FORMAT.ROLE_HEAD_SHADOW);
                shadowLines.forEach((l) => lines.push(l));
            }

            if (yoinShort) {
                lines.push("");
                lines.push(yoinShort);
            }

            // ✅ ここがポイント：closeLines が来たらそれ、なければデフォルト
            const closing = Array.isArray(closeLines) ? closeLines : RENDER_COPY.X_FORMAT.CLOSE_LINES;

            lines.push("");
            lines.push(...closing);

            return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        },


        // 最終ブロック（意味行なし）
        BLOCK: ({ dateLabel, moonSignJa, skyLine, secretLine, yoin, toneKeywords }) => {
            const lines = [];

            lines.push(RENDER_COPY.X_FORMAT.TITLE_LINE(dateLabel));
            if (moonSignJa) lines.push(RENDER_COPY.X_FORMAT.MOON_LINE(moonSignJa));

            lines.push("");
            lines.push(skyLine);

            if (secretLine) {
                lines.push("");
                lines.push(secretLine);
            }

            const y = RENDER_COPY.X_FORMAT.YOIN_LINES_2(yoin);
            if (y) {
                lines.push("");
                lines.push(y);
            }

            const kwLine = RENDER_COPY.X_FORMAT.KEYWORDS_LINE(toneKeywords);
            const yoinHasKw = RENDER_COPY.X_FORMAT._yoinContainsKeywords(yoin, toneKeywords);
            if (kwLine && !yoinHasKw) {
                lines.push("");
                lines.push(kwLine);
            }

            lines.push("");
            lines.push("解釈は、あなたのもの。🌎️🛸");

            return lines.join("\n").replaceAll("\n\n\n", "\n\n");
        },
    },



    // --------------------
    // IG formatting（copy-driven）
    // --------------------
    IG_FORMAT: {
        MOON_LINE_OK: (moonSignJa) => (moonSignJa ? `月は ${moonSignJa} を通過中。` : "月のサインは取得中。"),

        SKY_LINE_NUM: (i, a, aSign, b, bSign) => `${i}) ${a}${aSign} × ${b}${bSign}`,
        SKY_LINE_ASPECT: (aspectJa, orb) => `${aspectJa}（orb ${orb}°）`,

        MEANING_BLOCK: ({ aLabel, aCore, bLabel, bCore, tone, aspectCoreText }) => {
            const t = tone ? `「${tone}」空気の中で、` : "";
            return (
                `${aLabel}（${aCore || "—"}）と、\n` +
                `${bLabel}（${bCore || "—"}）が、\n\n` +
                (t ? `${t}\n` : "") +
                `${aspectCoreText || "—"}。`
            ).replaceAll("\n\n\n", "\n\n");
        },

        SECRET_HEAD: "ひそかな配置",

        BLOCK: ({ dateLabel, moonLine, bodyLines, footer }) =>
            `${RENDER_COPY.IG_TITLE(dateLabel)}

${moonLine}

${bodyLines}

${footer}`,
    },
});

module.exports = { RENDER_COPY };
