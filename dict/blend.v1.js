"use strict";

/**
 * blend.v1 (FULL INTEGRATED)
 * - LEGACY: 既存文言（絶対に壊さない）
 * - VERTICAL: 現行LINE（2行＋→）
 * - FUSION: かけ合わせ統合（1文）
 *
 * 原則：
 * - 予言しない
 * - 良し悪しを言わない
 * - 解釈を固定しない
 *
 * NOTE:
 * - FUSION は “辞書の全部を複製しない”
 *   → 部分辞書 + フォールバック（SIGNS/PLANETSのcore等）で落ちない設計
 */

const BLEND_V1 = Object.freeze({
    version: "blend.v1",
    locale: "ja",

    // --------------------
    // Style / Layout rules
    // --------------------
    style: Object.freeze({
        block_gap: "\n\n",
        line_break: "\n",
        bullet: "・",
        arrow: "→",
        x: "×",
        dash: "｜",
        quote_open: "「",
        quote_close: "」",
    }),

    limits: Object.freeze({
        max_line_chars: 34,
        max_block_chars: 340,
        max_total_chars: 1800,
    }),

    // ==================================================
    // ① LEGACY：既存そのまま（文末固定）
    // ==================================================
    legacy: Object.freeze({
        aspect_sentence_by_label_ja: Object.freeze({
            "コンジャンクション": "同じ領域で重なり、性質が強く表れやすい配置。",
            "セクスタイル": "噛み合う通路ができ、協力や選択肢が開きやすい配置。",
            "スクエア": "進行方向の違いが交差し、摩擦や調整点が表に出やすい配置。",
            "トライン": "自然に循環しやすく、無理なく機能しやすい配置。",
            "オポジション": "外側（関係/出来事）に映りやすく、鏡として見えやすい配置。",

            "セミセクスタイル": "気配レベルの接点として現れやすく、意識の外で反応しやすい配置。",
            "セミスクエア": "小さな引っかかりとして出やすく、微調整のサインになりやすい配置。",
            "セスキスクエア": "積み重なった圧が表に出やすく、転換点の摩擦として現れやすい配置。",
            "インコンジャンクト": "自然に噛み合いにくく、合わせにいく調整圧が出やすい配置。",
            "クインタイル": "独自の工夫が生まれやすく、創造の回路として現れやすい配置。",
            "バイクインタイル": "反復と試行錯誤で熟成し、表現が整い続けやすい配置。",
        }),
    }),

    // ==================================================
    // ② VERTICAL：いまのLINE用（2行＋→）
    // ==================================================
    vertical: Object.freeze({
        planet_in_sign: Object.freeze({
            pattern_ja: "{sign}の{planet}：{sign_core}の領域で、{planet_core}",

            // 短文化（未定義なら PLANETS_V1 / SIGNS_V1 の core を使う想定）
            planet_core_override_ja: Object.freeze({
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
                ASC: "入口／印象／身体感覚",
            }),

            sign_core_override_ja: Object.freeze({
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
            }),
        }),

        // まずは LEGACY を参照してOK。上書きしたい時だけ追加する。
        aspect_sentence_by_label_ja: Object.freeze({
            // ここは必要に応じて “差分だけ” 入れる。未定義は legacy を使う。
            // 例: "セスキスクエア": "積み重なった圧が表に出やすく…",
        }),
    }),

    // ==================================================
    // ③ FUSION：かけ合わせ統合（1文）
    // - 主語（天体名）を出さない
    // - でも “何が起きやすいか” は残す
    // - orb は煽らず「密度/近さ」に変換
    // ==================================================
    fusion: Object.freeze({
        // サイン → 場（部分辞書。無い場合は SIGNS core にフォールバック）
        sign_field_ja: Object.freeze({
            aries: "始まりの端",
            taurus: "定着の地層",
            gemini: "行き来の風",
            cancer: "内側の水辺",
            leo: "中心の灯",
            virgo: "整える手元",
            libra: "調律の場",
            scorpio: "境界の深部",
            sagittarius: "視野の外縁",
            capricorn: "現実の骨格",
            aquarius: "更新の視点",
            pisces: "溶解の場",
        }),

        // 惑星 → 作用（部分辞書。無い場合は PLANETS core にフォールバック）
        // ※ “単語化”しすぎると意味が消えるので、短いが核は残す。
        planet_action_ja: Object.freeze({
            Sun: "中心",
            Moon: "反応",
            Mercury: "言葉",
            Venus: "価値",
            Mars: "境界",
            Jupiter: "拡大",
            Saturn: "枠",
            Uranus: "更新",
            Neptune: "溶解",
            Pluto: "圧",
            Chiron: "傷の入口",
            ASC: "入口",
        }),

        // アスペクト → 力学（ここが “かけ合わせの意味” の核）
        aspect_dynamics_ja: Object.freeze({
            "コンジャンクション": "性質が重なって強調されやすい",
            "セクスタイル": "噛み合う余白が生まれやすい",
            "スクエア": "摩擦や調整点が表に出やすい",
            "トライン": "自然に循環しやすい",
            "オポジション": "外側に映りやすく、鏡として見えやすい",

            "セミセクスタイル": "気配の接点として反応が出やすい",
            "セミスクエア": "小さな引っかかりとして微調整が起きやすい",
            "セスキスクエア": "積み重なった圧が摩擦として表に出やすい",
            "インコンジャンクト": "噛み合いにくさが調整として出やすい",
            "クインタイル": "工夫や創造の回路が立ち上がりやすい",
            "バイクインタイル": "反復で熟成し、整い続けやすい",
        }),

        // orb → “近さ” ではなく “密度” の表現（煽らない）
        // ※ orb が小さいほど “密度が高い” とだけ置く
        orb_hint_ja: Object.freeze([
            { max: 0.3, text: "" },
            { max: 1.0, text: "" },
            { max: 3.0, text: "" },
            // 6° くらいまでは無表示でOK
        ]),

        // ✅ 2サイン×2作用×アスペクト×orb を “溶かす” テンプレ
        template_ja:
            "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}がにじみ、{dynamics}{orb_hint}。",

        // よりミニマルが欲しい時の別テンプレ（任意）
        template_mini_ja:
            "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",

        template_micro_ja:
            "{dynamics}{orb_hint}。",

        // ✅ sky 用（トランジット×トランジット）
        template_sky_ja:
            "{field_natal}で{action_natal}が動き、{field_transit}で{action_transit}が重なり、{dynamics}{orb_hint}。",

        template_sky_mini_ja:
            "{field_natal}と{field_transit}の間で、{dynamics}{orb_hint}。",

        template_sky_micro_ja:
            "{dynamics}{orb_hint}。",
    }),

    // ==================================================
    // ④ BLOCK TEMPLATES（切替器）
    // ==================================================
    blocks: Object.freeze({
        legacy: Object.freeze({
            body_lines_ja: ["{arrow} {aspect_sentence}"],
        }),

        vertical: Object.freeze({
            body_lines_ja: ["{natal_blend}", "{transit_blend}", "{arrow} {aspect_sentence}"],
        }),

        fusion: Object.freeze({
            body_lines_ja: ["{fusion_sentence}"],
        }),

        // ✅ 追加：sky 用（内容は fusion と同じ）
        sky_fusion: Object.freeze({
            body_lines_ja: ["{fusion_sentence}"],
        }),
    }),

    headers: Object.freeze({
        personal_aspect_ja:
            "{idx}ネイタル：{natal} × トランジット：{transit}｜{aspect}（{angle}°｜orb {orb}°）",
        sky_aspect_ja:
            "{idx}{a} × {b}｜{aspect}（{angle}°｜orb {orb}°）",
    }),
});

module.exports = { BLEND_V1 };
