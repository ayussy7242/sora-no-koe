"use strict";

/**
 * copy/render.js — 正本（Render Copy）
 * - render.js が出す「固定文言」をここに集約
 * - トンマナ統一：「占いじゃない／構造を置く／解釈はあなた」
 * - 用語統一：「あなたの星」「今日のソラ」「今日の星（あなたの星×今日のソラ）」
 * - render.js は “組み立て” だけ（判断しない）
 */

// --------------------
// Base constants (自己参照禁止のため、先に定数化)
// --------------------
const BRAND = "ソラのこえ。";

const HEAD_TODAY = "【今日の星（あなたの星×今日のソラ）】";
const HEAD_SKY = "【今日のソラ（星の配置）】";
const HEAD_SKY_MAIN = "【星の主な配置】";
const HEAD_MOON = "【今日の月】";
const HEAD_YOIN = "【今日の余韻】";
const HEAD_NATAL_LIST = "🌌 わたしのほし（あなたの星の一覧）";

// v3.3: 詳細版「地層の余韻」を出したい時だけON（空文字なら render.js 側で出ない）
const HEAD_YOIN_GLOBAL = "";

// footer
const FOOTER_LINE = ["解釈は、あなたのもの。", "星は語る。決めるのは、人。🌎️🛸✨️"];
const FOOTER_X = "星は語る。🌎🛸";
const FOOTER_IG = FOOTER_LINE.join("\n");

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

    LINE_TITLE: (dateLabel) => `🌌 今日のソラのこえ。｜${dateLabel}`,
    X_TITLE: () => `🌌 ${BRAND}`,
    IG_TITLE: (dateLabel) => `🌌 ${BRAND}｜${dateLabel}`,

    // --------------------
    // Section Heads（用語統一）
    // --------------------
    HEAD_TODAY,
    HEAD_SKY,
    HEAD_SKY_MAIN,
    HEAD_MOON,
    HEAD_YOIN,
    HEAD_NATAL_LIST,

    // ✅ v3.3: 詳細版「地層の余韻」見出し（空なら render.js 側で非表示）
    HEAD_YOIN_GLOBAL,

    // --------------------
    // Footer / Philosophy
    // --------------------
    FOOTER_LINE,
    FOOTER_X,
    FOOTER_IG,

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
    MEANING_NO_ASPECT_CORE: (left, right) =>
        `${left} と \n${right} の\n噛み合い方が動きやすい配置。`,

    // --------------------
    // Moon line
    // --------------------
    MOON_LINE_OK: (moonSignJa, hintOrNull) =>
        hintOrNull
            ? `${HEAD_MOON}\n月は ${moonSignJa}（${hintOrNull}） を通過中。`
            : `${HEAD_MOON}\n月は ${moonSignJa} を通過中。`,
    MOON_LINE_LOADING: () => `${HEAD_MOON}\n月のサインは取得中。`,

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
            [
                HEAD_NATAL_LIST,
                "",
                "（まだ準備中みたい）",
                "LINEで「はじめる」から登録してね🕊️",
            ].join("\n"),

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
    // Yoin（余韻：短文）
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

        TAIL_POOL_1: [
            "今日の理解は、あとで追いつくかもしれない。",
            "言葉にしなくても、構造は残る。",
            "決めなくていいまま、置いておける日。",
            "動いてもいい。動かなくても、壊れない。",
            "答えより、手触りを持ち帰る。",
            "意味づけは、あなたのタイミングで。",
        ],

        TAIL_POOL_2: [
            "先に身体、あとで言葉。",
            "焦点を変えるだけで、景色が変わる日。",
            "余白を残して、次に渡す。",
            "今日は“結論”じゃなくて“残響”で十分。",
            "これでいい、を急がない。",
        ],

        BUILD: ({ topElement, topModality, aspectLabel } = {}) => {
            const head =
                (topElement && RENDER_COPY.YOIN.ELEMENT_PHRASE[topElement]) ||
                RENDER_COPY.YOIN.FALLBACK;

            const tailBits = [];
            if (topModality && RENDER_COPY.YOIN.MODALITY_PHRASE[topModality]) {
                tailBits.push(RENDER_COPY.YOIN.MODALITY_PHRASE[topModality]);
            }
            if (aspectLabel) tailBits.push(`質感は ${aspectLabel} 寄り`);

            const tail = tailBits.length ? `${tailBits.join("、")}。` : "";
            const out = `${head}${tail ? ` ${tail}` : ""}`.trim();

            if (out.length > 90) return head;
            return out.replace(/。\s+/g, "。").trim();
        },

        // ✅ v3.3：global短文 + center短文 を「そのまま縦連結」するだけ
        GLUE: (globalText, centerText) => {
            const g = String(globalText || "").trim();
            const c = String(centerText || "").trim();
            if (!g && !c) return "";
            if (!g) return c;
            if (!c) return g;
            return `${g} ${c}`; // 改行じゃなくスペース
        },
    },

    // --------------------
    // Yoin Global（余韻：地層） v3.3
    // --------------------
    YOIN_GLOBAL: {
        TAIL_POOL: [
            "空は“結論”より“配置”を残す。",
            "強さは、派手さじゃなく配分で決まる。",
            "今日は層が厚い。言葉はあとで追いつく。",
            "同じ現象でも、受け取り方は何層もある。",
            "静かに、編み直せる日。",
        ],

        BUILD_SHORT: ({ topElement, topModality, core1, core2, seedBase, pickStable } = {}) => {
            const elementJa = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合", unknown: "未判定" };
            const modalityJa = { cardinal: "活動", fixed: "不動", mutable: "柔軟", mixed: "混合", unknown: "未判定" };

            const layer = `${elementJa[topElement] || "混合"}×${modalityJa[topModality] || "混合"}`;
            const theme = core1 ? `中心は「${core1}」` : "中心は「言葉より手触り」";
            const sub = core2 ? `／副旋律「${core2}」` : "";

            let out = `地層：${layer}。${theme}${sub}`.trim();

            const pool = Array.isArray(RENDER_COPY?.YOIN_GLOBAL?.TAIL_POOL) ? RENDER_COPY.YOIN_GLOBAL.TAIL_POOL : [];
            const tail = (typeof pickStable === "function" && seedBase && pool.length)
                ? pickStable(pool, seedBase + "|tail")
                : "";

            if (tail) out = `${out}｜${tail}`;
            return out.length > 90 ? `地層：${layer}。${theme}` : out;
        },

        BUILD_DETAIL: ({ story, seedBase, pickStable, buildYoinGlobal }) => {
            const short = typeof buildYoinGlobal === "function"
                ? buildYoinGlobal(story, { compact: false, maxContacts: 12, minWeight: 0.10 })
                : "";

            const pool = Array.isArray(RENDER_COPY?.YOIN_GLOBAL?.TAIL_POOL) ? RENDER_COPY.YOIN_GLOBAL.TAIL_POOL : [];
            const tail = (typeof pickStable === "function" && seedBase && pool.length)
                ? pickStable(pool, seedBase + "|detail_tail")
                : "";

            return [short, tail].filter(Boolean).join("\n");
        },
    },

    // --------------------
    // X formatting（compact template / CLEAN）
    // --------------------
    X_FORMAT: {
        TITLE_LINE: (dateLabel) => `🌌 ${dateLabel}｜今日のソラ`,
        MOON_LINE: (moonSignJa) => (moonSignJa ? `🌙月: ${moonSignJa}` : ""),

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

        /**
           * 12カテゴリ × 6セット = 72セット（各セットは2行）
           * - “断定しない”
           * - “行動指示しない”
           * - “good/badにしない”
           */
        CLOSE_CATEGORIES: Object.freeze([
            "quiet",      // 静か・回収
            "reset",      // リセット・整える
            "focus",      // 焦点・収束
            "move",       // 動かす・着手
            "connect",    // つなぐ・交渉
            "expand",     // 広げる・選択肢
            "friction",   // 摩擦・すれ違い
            "boundary",   // 境界・守る
            "anchor",     // 現実・足場
            "spark",      // 点火・衝動
            "drift",      // 余韻・漂う
            "integrate",  // 統合・編み直し
        ]),

        CLOSE_LINES_BY_CATEGORY: Object.freeze({
            quiet: [
                ["静かでいい。", "回収するだけの日も、必要。"],
                ["今日は余白が勝つ。", "増やさず整えると軽い。"],
                ["音量を上げなくていい。", "届くものは届く。"],
                ["止まっても、遅れてない。", "静けさも進行。"],
                ["外より内のノイズが減る。", "だから十分。"],
                ["言葉は後でいい。", "配置だけ残す。"],
            ],

            reset: [
                ["整えるほど、楽になる。", "小さく戻す日。"],
                ["消すより先に、並べ直す。", "形が戻る。"],
                ["やることを減らす。", "輪郭が出る。"],
                ["最短の修正でいい。", "全部やらない。"],
                ["片付けは前進。", "ゼロに戻すんじゃなく整地。"],
                ["今日は“更新”より“調整”。", "違和感だけ直す。"],
            ],

            focus: [
                ["焦点を一つに絞れる。", "それだけで進む。"],
                ["選ぶだけで十分。", "増やさない。"],
                ["広げる前に、芯。", "芯が決まると早い。"],
                ["一点の精度が上がる日。", "雑にやらない。"],
                ["言葉は少なくていい。", "核心だけ通す。"],
                ["今日の勝ちは“収束”。", "散らさない。"],
            ],

            move: [
                ["小さく動かすと決まる。", "一手でいい。"],
                ["着手が一番の整理。", "やりながら整う。"],
                ["迷いは残ったままでOK。", "でも手は動く。"],
                ["止めずに、軽く回す。", "回ると見える。"],
                ["決断じゃなく実行。", "試すだけ。"],
                ["今日は“開始”が効く。", "でも無理はしない。"],
            ],

            connect: [
                ["言葉が橋になる日。", "繋ぎ方を選べる。"],
                ["会話は正しさより接続。", "通じる形にする。"],
                ["交換できる。", "一人で抱えない。"],
                ["交渉は勝ち負けじゃない。", "条件を揃える。"],
                ["伝えるなら短く。", "余白を残す。"],
                ["繋がる先は一つじゃない。", "選択肢を持つ。"],
            ],

            expand: [
                ["視野は広がる。", "結論は急がない。"],
                ["可能性は増える日。", "固定しなくていい。"],
                ["選択肢を並べるだけでいい。", "決めるのは後。"],
                ["広げても、散らさない。", "優先順位だけ持つ。"],
                ["未知を怖がらなくていい。", "まだ未確定でOK。"],
                ["今日は“余白の拡張”。", "詰め込まない。"],
            ],

            friction: [
                ["引っかかりは悪者じゃない。", "調整点が見えてるだけ。"],
                ["噛み合わなさは情報。", "壊す前に読み取る。"],
                ["ズレを責めない。", "合う場所を探す。"],
                ["反応が強い日は、正直。", "でも断定はしない。"],
                ["摩擦は“境目”を示す。", "線を引き直す。"],
                ["今日は衝突より整合。", "一致点だけ拾う。"],
            ],

            boundary: [
                ["守る線を決める。", "それで楽になる。"],
                ["優しさと境界は両立する。", "薄くしすぎない。"],
                ["距離感を調整する日。", "近づきすぎない。"],
                ["“全部OK”にしない。", "OKの範囲を選ぶ。"],
                ["境界は冷たさじゃない。", "設計。"],
                ["断るのも、整える一手。", "関係を壊さず守る。"],
            ],

            anchor: [
                ["現実に落とすと強い。", "形にすると戻らない。"],
                ["土台が先。", "上は後で乗る。"],
                ["数・時間・体力に合わせる。", "それが正しい。"],
                ["安定は小さい積み上げ。", "派手さはいらない。"],
                ["今日の勝ちは“足場”。", "地面から作る。"],
                ["一回、手触りを確認。", "触れるものから。"],
            ],

            spark: [
                ["火はある。", "でも点火は急がなくていい。"],
                ["衝動は悪くない。", "使う場所を選ぶ。"],
                ["熱を一点に集める。", "散らすと消える。"],
                ["勢いより芯。", "芯が熱いなら進める。"],
                ["今日は“灯す”日。", "燃やし尽くさない。"],
                ["やりたいが出たら正解。", "小さく着火する。"],
            ],

            drift: [
                ["余韻が先に来る日。", "意味は後でいい。"],
                ["説明しなくていい。", "感じた時点で受信。"],
                ["水面が揺れる。", "揺れを止めない。"],
                ["今日は漂ってOK。", "着地は急がない。"],
                ["境界を薄くしすぎない。", "でも閉じない。"],
                ["静かに浸透する。", "だから急がない。"],
            ],

            integrate: [
                ["矛盾を抱えたまま、進める。", "統合は後から起きる。"],
                ["混ざり合う日。", "決めすぎない方が綺麗。"],
                ["両方持てる。", "片方を切らなくていい。"],
                ["編み直しが効く。", "やり直しが軽い。"],
                ["今日は“整理”じゃなく“統合”。", "一段上でまとめる。"],
                ["違う層が一つになる。", "今は途中でOK。"],
            ],
        }),


        BLOCK_ROLE: ({ dateLabel, moonSignJa, mainLine, mainArrow, shadowLines = [], yoinShort, closeLines }) => {
            const lines = [];
            lines.push(`🌌 ${dateLabel}｜空の配置`);
            if (moonSignJa) lines.push(`月：${moonSignJa}`);

            lines.push("");
            lines.push(RENDER_COPY.X_FORMAT.ROLE_HEAD_MAIN);
            lines.push(mainLine);

            //Xでは使わない
            //   if (mainArrow) lines.push(mainArrow);

            if (shadowLines.length) {
                lines.push("");
                lines.push(RENDER_COPY.X_FORMAT.ROLE_HEAD_SHADOW);
                shadowLines.forEach((l) => lines.push(l));
            }

            const glued = RENDER_COPY.YOIN.GLUE(null, yoinShort);

            if (glued) {
                lines.push("");
                lines.push(glued);
            }

            const closing = Array.isArray(closeLines) ? closeLines : RENDER_COPY.X_FORMAT.CLOSE_LINES;
            lines.push("");
            lines.push(...closing);

            return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    },
});

module.exports = { RENDER_COPY };
