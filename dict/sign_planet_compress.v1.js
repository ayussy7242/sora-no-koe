"use strict";

/**
 * sign_planet_compress.v1
 * - overrides: 例外だけ手で圧縮（無ければ auto_compress へ）
 * - 文章は「判断しない／予測しない／行動を促さない」
 */
const SIGN_PLANET_COMPRESS_V1 = {
  version: "sign_planet_compress.v1",

  overrides: {
    // 例：核だけ置く（断定しない）
    "Sun_in_Leo": { core: "自分の中心そのものが、表現として外に置かれやすい" },
    "Moon_in_Scorpio": { core: "安心が深層に沈み、簡単に触れさせない反応が残りやすい" },
    "Mercury_in_Pisces": { core: "言葉になる前の感覚が、理解の回路を通りやすい" },

    "Lilith_in_Pisces": { core: "溶けきらなかった主権が、余韻として残りやすい" },
    "Chiron_in_Virgo": { core: "整えようとするほど、傷の入口が可視化されやすい" },
    "Pluto_in_Aquarius": { core: "更新の空気の中で、根本の組み替えが前に出やすい" },
  },
};

module.exports = { SIGN_PLANET_COMPRESS_V1 };
