"use strict";

/**
 * blend.v1
 * 目的：
 * - PLANETS_V1 / SIGNS_V1 / ASPECTS_V1 を “縦に読める文章” に合成する辞書
 * - 予言しない / 良し悪し言わない / 決めつけない
 *
 * 設計思想：
 * - 「意味」＝ planets/signs/aspects
 * - 「合成」＝ blend（テンプレ＋接続語＋圧縮ルール）
 * - レンダラはこの辞書を使うだけ（文章の直書き禁止）
 */
const BLEND_V1 = {
    version: "blend.v1",
    locale: "ja",

    // --------------------
    // Style / Layout rules
    // --------------------
    style: {
        // LINE での視認性最優先
        block_gap: "\n\n",          // ブロック間の空行
        line_break: "\n",           // 行区切り
        bullet: "・",
        arrow: "→",
        x: "×",
        dash: "｜",
        quote_open: "「",
        quote_close: "」",
    },

    limits: {
        // レンダラ側で wrap するときの目安（超えても落とさない）
        max_line_chars: 34,         // 1行が長すぎるとLINEで読みにくい
        max_block_chars: 340,       // 1アスペクト=1ブロックの安全圏
        max_total_chars: 1800,      // 長文になりすぎる時の保険（deep用）
    },

    // --------------------
    // Planet-in-sign blend (the key improvement)
    // --------------------
    planet_in_sign: {
        // 1行圧縮テンプレ：必ず “サインの領域” を混ぜる
        // 例：山羊座の海王星：現実・責任・積み上げの領域で、曖昧／溶解／夢
        pattern_ja: "{sign}の{planet}：{sign_core}の領域で、{planet_core}",

        // よく出る語を短くする（任意。未定義なら元辞書の core を使う）
        planet_core_override_ja: {
            Sun: "中心／意志／生の火",
            Moon: "感情／反応／安心",
            Mercury: "思考／言葉／接続",
            Venus: "好み／関係／価値",
            Mars: "行動／衝動／境界",
            Jupiter: "拡大／寛容／追い風",
            Saturn: "枠組み／責任／鍛錬",
            Uranus: "刷新／解放／突然性",
            Neptune: "溶解／夢／境界の薄さ",
            Pluto: "変容／極点／再生",
            Chiron: "傷と癒し／学びの入口",
        },

        sign_core_override_ja: {
            // “サインならでは”を短文化（必要に応じて調整）
            aries: "始まり／衝動／直線",
            taurus: "身体／感覚／定着",
            gemini: "情報／交換／軽さ",
            cancer: "居場所／保護／親密",
            leo: "表現／中心／誇り",
            virgo: "整える／分析／微調整",
            libra: "関係／バランス／美意識",
            scorpio: "深層／境界／変容",
            sagittarius: "拡張／探求／視野",
            capricorn: "構造／責任／積み上げ",
            aquarius: "刷新／観測／自由",
            pisces: "溶解／共鳴／余韻",
        },

        // “2行目” をさらに詩っぽくする時の補助（任意）
        // 例：〜が、〜として働きやすい / 〜が、〜に触れやすい
        connectors_ja: {
            and: "と",
            as: "として",
            tends: "が立ち上がりやすい",
            touch: "が触れやすい",
        },
    },

    // --------------------
    // Aspect sentence (closing line of a block)
    // --------------------
    aspect_sentence: {
        // label_ja で引けるようにしておく（表示名が SSOT だから）
        by_label_ja: {
            "コンジャンクション": "同じ領域で重なり、性質が強く表れやすい配置。",
            "セクスタイル": "噛み合う通路ができ、協力や選択肢が開きやすい配置。",
            "スクエア": "進行方向の違いが交差し、摩擦や調整点が表に出やすい配置。",
            "トライン": "自然に循環しやすく、無理なく機能しやすい配置。",
            "オポジション": "外側（関係/出来事）に映りやすく、鏡として見えやすい配置。",

            // deep_space 系（無料でも personal では出るので必須）
            "セミセクスタイル": "気配レベルの接点として現れやすく、意識の外で反応しやすい配置。",
            "セミスクエア": "小さな引っかかりとして出やすく、微調整のサインになりやすい配置。",
            "セスキスクエア": "積み重なった圧が表に出やすく、転換点の摩擦として現れやすい配置。",
            "インコンジャンクト": "自然に噛み合いにくく、合わせにいく調整圧が出やすい配置。",
            "クインタイル": "独自の工夫が生まれやすく、創造の回路として現れやすい配置。",
            "バイクインタイル": "反復と試行錯誤で熟成し、表現が整い続けやすい配置。",
        },

        // “触れやすい” などの見出し語に合わせて、文末だけ変えたい時（将来）
        // 今は未使用でOK。拡張の器。
        by_context_ja: {
            touchable: {
                "セスキスクエア": "溜まった圧が触れやすく、摩擦として表面化しやすい配置。",
            },
        },
    },

    // --------------------
    // Block templates (1 aspect = 1 block)
    // --------------------
    blocks: {
        personal_aspect_block: {
            // ① ネイタル：海王星（山羊座） × トランジット：天王星（牡牛座）｜セスキスクエア（135°｜orb 0.1°）
            header_ja:
                "{idx} ネイタル：{natal} {x} トランジット：{transit} {dash} {aspect}（{angle}°{dash}orb {orb}°）",


      // 2行：planet-in-sign を必ず出す（サインの意味を落とさない）
      body_lines_ja: [
                "{natal_blend}",
                "{transit_blend}",
                "{arrow} {aspect_sentence}",
            ],

            // 余計な空行を作らないためのフィルタ（レンダラ側で空文字を除外）
        },
    },
};

module.exports = { BLEND_V1 };
