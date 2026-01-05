"use strict";

/**
 * copy/render.js — V1 正本（Render Copy）
 * - render.js が出す「固定文言」をすべてここに集約
 * - Bトーン（少しだけ可愛い / アイコン寄せ）だけど、星の“中身”は占い化しない
 * - render.js からは「文字列を組む」だけにする
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
    // Section Heads
    // --------------------
    HEAD_PERSONAL: "【今日の星の配置（あなたの座標×空の構造）】",
    HEAD_PUBLIC: "【今日の星の配置（空の構造）】",
    HEAD_SKY: "【空の主な配置】",
    HEAD_MOON: "【今日の月の位置】",
    HEAD_YOIN: "【今日の余韻】",
    HEAD_NATAL_LIST: "🌌 わたしのほし（ネイタル一覧）",

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

    // --------------------
    // Meaning line templates (non-predictive)
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
    // Yoin label
    // --------------------
    YOIN_PREFIX_X: "余韻：",

    // --------------------
    // No-contact pools
    // - 星の接触が少ない日用の “余白” 文言
    // - render.js は element/modality をキーにここから選ぶだけ
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
    // X / IG formatting templates
    // --------------------
    X_FORMAT: {
        DATE_LINE: (dateLabel) => `［${dateLabel}｜空の配置］`,
        MOON_LINE: (moonSignJa) => (moonSignJa ? `\n月は ${moonSignJa} を通過中。` : ""),
        SKY_LINE: (i, a, aSign, b, bSign, aspectJa, orb) =>
            `${i}) ${a}${aSign} × ${b}${bSign}｜${aspectJa}（orb ${orb}°）`,
        BLOCK: ({ dateLabel, moonLine, skyLines, yoin }) =>
            `${RENDER_COPY.X_TITLE()}
${RENDER_COPY.X_FORMAT.DATE_LINE(dateLabel)}${moonLine}

${skyLines}

${RENDER_COPY.YOIN_PREFIX_X}${yoin}
${RENDER_COPY.FOOTER_X}`,
    },

    IG_FORMAT: {
        MOON_LINE_OK: (moonSignJa) => (moonSignJa ? `月は ${moonSignJa} を通過中。` : "月のサインは取得中。"),
        SKY_LINE: (a, aSign, b, bSign, aspectJa, orb) =>
            `・${a}${aSign} × ${b}${bSign}｜${aspectJa}（orb ${orb}°）`,
        BLOCK: ({ dateLabel, moonLine, skyLines, yoin }) =>
            `${RENDER_COPY.IG_TITLE(dateLabel)}

${moonLine}

${RENDER_COPY.HEAD_SKY}
${skyLines}

${RENDER_COPY.HEAD_YOIN}
${yoin}

${RENDER_COPY.FOOTER_IG}`,
    },

    // --------------------
    // Natal list copy (when cache missing / incomplete)
    // --------------------
    NATAL_LIST: {
        NOT_READY: () =>
            [
                RENDER_COPY.HEAD_NATAL_LIST,
                "",
                "（まだネイタルが準備中みたい）",
                "「はじめる」から登録してみてね🕊️",
            ].join("\n"),

        MISSING_ANGLES: () =>
            [
                RENDER_COPY.HEAD_NATAL_LIST,
                "",
                "ASC/MC がまだ見つからなかった🙏",
                "（ネイタル計算結果に ASC/MC を保存する処理が必要）",
                "",
                "※ 天体は出せるけど、座標の要（ASC/MC）が欠けるからここでは止めてる。",
            ].join("\n"),

        NOTE: () =>
            [
                "",
                "※ これは「配置」の一覧です。",
                "※ 意味や解釈は置いていません。",
                "",
                "星は語る。",
                "決めるのは、人。🌎️🛸✨️",
            ].join("\n"),
    },

    // --------------------
    // Optional: small cute guide (render.jsで使いたい時だけ)
    // --------------------
    GUIDE: {
        // 例）LINEで sky-only のとき、最後に付けたい場合に使える
        SKY_ONLY_HINT: () =>
            "\n\n（「今日」は登録があると personal が立ち上がりやすい🌌\n登録は「はじめる」）",
    },

    // --------------------
    // Today layers (personal only)
    // --------------------
    HEAD_LAYERS: {
        THEME: "【今日の中心（いちばん触れやすい場所）】",
        TOUCH: "【引っかかりやすい接点】",
        HIDDEN: "【ひそやかな接点】",
    },

    // --------------------
    // Optional labels
    // --------------------
    LABELS: {
        NATAL: "ネイタル：",
        TRANSIT: "トランジット：",
    },

});

module.exports = { RENDER_COPY };
