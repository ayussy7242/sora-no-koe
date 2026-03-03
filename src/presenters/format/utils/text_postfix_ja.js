"use strict";

/**
 * engine/text_postfix_ja.js (SSOT)
 * - export名ズレ吸収: resolveFn
 * - 日本語の生成事故修正: postFixFusionJa
 * - 句読点事故を構造的に減らす: (optional) sentenceize / joiners
 *
 * Usage:
 *   const { resolveFn, postFixFusionJa } = require("./text_postfix_ja");
 *   const fixed = postFixFusionJa(raw, { style: "poem" }); // default
 *   const fixed2 = postFixFusionJa(raw, { style: "sentence" }); // 丸め優先
 */

// ============================================================
// export 名ズレ吸収（SSOT）
// ============================================================
function resolveFn(mod, names, modLabel) {
    for (const n of names) {
        if (typeof mod?.[n] === "function") return mod[n];
    }
    if (typeof mod === "function") return mod;
    if (typeof mod?.default === "function") return mod.default;

    const keys = Object.keys(mod || {});
    throw new Error(
        `${modLabel} missing function. tried=${names.join(",")} exports=[${keys.join(",")}]`
    );
}

// ============================================================
// helpers: join/sentenceize（丸めの土台）
// ============================================================
function _trim(s) {
    return String(s ?? "").trim();
}
function _nonEmpty(s) {
    return !!_trim(s);
}
function joinJa(parts, sep = "、") {
    return (Array.isArray(parts) ? parts : [parts])
        .map((v) => _trim(v))
        .filter(Boolean)
        .join(sep);
}
function toSentence(parts) {
    const s = joinJa(parts, "、");
    return s ? `${s.replace(/[、。]+$/g, "")}。` : "";
}

/**
 * sentenceize:
 * - 「、\n」区切りの詩風テキストを、文に丸めて事故を減らす
 * - 例: 1行目が長すぎ/読点地獄のときに効く
 */
function sentenceizeJa(text) {
    const t = _trim(text);
    if (!t) return t;

    // 行を「文」扱いに寄せて整理
    const lines = t
        .split("\n")
        .map((l) => _trim(l))
        .filter(Boolean);

    // 既に短く綺麗ならそのまま
    if (lines.length <= 2 && t.length <= 180) return t;

    // 句読点の終端を揃えて文にする（読点終わりは句点へ）
    const out = lines
        .map((l) => {
            let s = l.replace(/\s{2,}/g, " ");
            s = s.replace(/、\s*$/g, "。");
            if (s && !/[。！？]$/.test(s)) s += "。";
            return s;
        })
        .join("\n");

    return out.trim();
}

// ============================================================
// postFixFusionJa（SSOT）
// ============================================================
/**
 * @param {string} s
 * @param {object} opts
 * @param {"poem"|"sentence"} opts.style
 *   - poem: 改行と呼吸を残す（いまの路線）
 *   - sentence: 事故防止優先で丸め寄り
 * @returns {string}
 */
function postFixFusionJa(s, opts = {}) {
    const style = opts?.style || "poem";

    let out = _trim(s);
    if (!out) return out;

    // -----------------------------
    // 0) 基本整形
    // -----------------------------
    out = out.replace(/\s{2,}/g, " ");
    out = out.replace(/、\s*、/g, "、");
    out = out.replace(/。\s*。/g, "。");

    // -----------------------------
    // 1) 明確な生成バグ救済
    // -----------------------------
    out = out.replace(/ががが/g, "が").replace(/がが/g, "が");

    // 「がと」事故：基本は読点（句点にしない）
    // 「がと」事故：殺すんじゃなく “と” に整える（主語は後ろに寄せる）
    out = out.replace(
        /空気の([一-龠ぁ-んァ-ヶ]+)が\s*と\s*空気の([一-龠ぁ-んァ-ヶ]+)が/g,
        "空気の$1と空気の$2が"
    );

    // より一般形（空気の〜以外にも効く）
    out = out.replace(
        /([一-龠ぁ-んァ-ヶ]{1,20})が\s*と\s*([一-龠ぁ-んァ-ヶ]{1,20})が/g,
        "$1と$2が"
    );

    // 「拡大噛み合わなさ」などの助詞抜け
    out = out.replace(
        /(拡大|反応|更新|溶解|圧|中心|枠)(噛み合わなさ)/g,
        "$1が$2"
    );

    // 「空気の◯◯微細」系（助詞補完）
    out = out.replace(
        /空気の(枠|溶解|更新|反応|言葉|価値|中心|境界|圧)(?![がはをにで])(?!\s)/g,
        "空気の$1が"
    );

    // 「AとB同じ領域」→「AとBが同じ領域」
    out = out.replace(
        /([一-龠ぁ-んァ-ヶ]+と[一-龠ぁ-んァ-ヶ]+)(同じ領域)/g,
        "$1が$2"
    );

    // -----------------------------
    // 2) 導入句の句点を直す（ここ超大事）
    // -----------------------------
    // 「〜の中で。」は変 → 「〜の中で、\n」
    out = out.replace(/の中で。/g, "の中で、\n");

    // すでに「の中で、」なら改行だけ入れる
    out = out.replace(/の中で、\s*/g, "の中で、\n");

    // -----------------------------
    // 2.5) 同一フレーズ重複の圧を潰す（超重要）
    // -----------------------------
    // 「◯◯空気で ... 、◯◯空気で ...」→ 2回目の「◯◯空気で」を落とす
    out = out.replace(
        /([^\n。]{2,60}?空気で)([^。\n]*?)、\s*\1/g,
        "$1$2、"
    );

    // 文頭の「◯◯空気で言葉が動き」→「◯◯空気で、言葉が動き」
    out = out.replace(
        /^([^\n。]{2,60}?空気で)([一-龠ぁ-んァ-ヶ])/gm,
        "$1、$2"
    );

    // 「同じ領域でエネルギーが重なり」過多なら間引く
    out = out.replace(
        /(同じ領域で重なり)(、\s*\1)+/g,
        "$1"
    );

    // -----------------------------
    // 3) “動詞で終わる尻切れ” を救う（、に寄せる）
    // -----------------------------
    // NOTE: 「配置。」だけは句点のまま残したいので除外する
    const verbsToComma = [
        "動き",
        "重なり",
        "交差し",
        "つながりやすく",
        "生まれやすく",
        "開きやすく",
        "残りやすく",
        "出やすく",
        "現れやすく",
        "浮かびやすく",
        "触れやすく",
    ];

    for (const v of verbsToComma) {
        const re = new RegExp(`${v}。(?!\\s*配置)`, "g");
        out = out.replace(re, `${v}、\n`);
    }

    // 「◯◯し。」もだいたい尻切れ → 「◯◯し、\n」
    out = out.replace(/し。(?!\s*配置)/g, "し、\n");

    // -----------------------------
    // 4) 改行の呼吸（読点→改行）
    // -----------------------------
    out = out.replace(
        /、\s*(?=小さな|微調整|進行方向|摩擦|性質|接点|噛み合う|選択肢|意識|蓄積|積み重なった)/g,
        "、\n"
    );

    // -----------------------------
    // 5) 最終整形
    // -----------------------------
    out = out.replace(/\n{3,}/g, "\n\n");
    out = out.replace(/、\s*$/, "。");
    out = _trim(out);
    if (out && !/[。！？]$/.test(out)) out += "。";

    // ============================================================
    // 6) 丸め（オプション）
    // - style:"sentence" を指定したときだけ強制丸め
    // ============================================================
    if (style === "sentence") {
        out = sentenceizeJa(out);

        // ✅ “丸め” の決定打：改行を空白に（1段落化）
        out = out.replace(/\n+/g, " ");

        // 余分な空白整理
        out = out.replace(/\s{2,}/g, " ").trim();

        if (out && !/[。！？]$/.test(out)) out += "。";
    }

    return out.trim();
}

module.exports = {
    resolveFn,
    postFixFusionJa,

    // optional exports（使いたいなら）
    joinJa,
    toSentence,
    sentenceizeJa,
};
