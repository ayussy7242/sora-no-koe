"use strict";

/**
 * tone_variants.v1
 * - 出力の粒度と、含める要素のルール
 * - 文章の“中身”は辞書（planets/aspects/houses/signs/resonance）から引く
 */
const TONE_VARIANTS_V1 = {
  version: "tone_variants.v1",

  variants: {
    short: {
      label_ja: "短文",
      max_chars_hint: 200,
      include: {
        title: true,
        core_structure: true,     // 星×星 or 星×ハウス の構造
        resonance_bullets: 0,     // 箇条書きなし
        aspect_flavor_lines: 1,
        moon_sign_flavor_lines: 0,
        closing_line: true,
      },
    },

    normal: {
      label_ja: "標準",
      max_chars_hint: 900,
      include: {
        title: true,
        core_structure: true,
        resonance_bullets: 3,     // base_sets から3つ
        aspect_flavor_lines: 2,
        moon_sign_flavor_lines: 2,
        closing_line: true,
      },
    },

    deep: {
      label_ja: "深宇宙",
      max_chars_hint: 1500,
      include: {
        title: true,
        core_structure: true,
        resonance_bullets: 5,
        aspect_flavor_lines: 2,
        moon_sign_flavor_lines: 2,
        allow_minor_aspects: true,
        allow_deep_space_aspects: true,
        include_intensity_phrase: true, // orbによる濃度フレーズ
        closing_line: true,
      },
    },
  },

  order: ["short", "normal", "deep"],
};

module.exports = { TONE_VARIANTS_V1 };
