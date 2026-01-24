"use strict";

/**
 * grammars.v1
 * - 文法レイヤー（日本語の“言葉選択”）を司る辞書
 * - SIGN×PLANET / ASPECT が持つ「構造タグ」を、文章として自然に“呼吸化”する
 * - 判断しない／予測しない／行動を促さない を文法の選択肢で担保する
 *
 * 目的（超重要）
 * - auto_compress を「固定文」から「選択式」にするための“型”と“選び方”をここで定義する
 */

const GRAMMARS_V1 = {
  version: "grammars.v1",

  // ----------------------------
  // 文章で頻出する “機能” ごとの語彙プール
  // ----------------------------
  categories: {
    emergence: ["兆し", "反応", "立ち上がり", "揺れ", "気配", "動き"],

    force: ["圧", "張力", "作用", "引力", "熱", "推進力"],

    conjunctions: ["と", "および", "のあいだで", "の同時進行として", "が並び"],

    expression: ["表現", "言葉", "振る舞い", "外への出方", "示し方"],

    process: ["試行錯誤", "調整", "行き来", "反復", "組み替え", "手探り"],

    clarity: ["輪郭", "形", "手応え", "重み", "まとまり"],

    direction: ["立ち", "整い", "残り", "露わになり", "前に出てき"],

    /**
     * tendency: 逃がし（非断定）— “語尾パーツ”として運用
     * - suffix はテンプレに足しても自然な形にしておく
     */
    tendency: {
      light: [
        { key: "easy", suffix: "しやすい" },
        { key: "likely", suffix: "になりやすい" },
        { key: "appear", suffix: "として現れやすい" },
        { key: "show", suffix: "が出やすい" },
      ],
      mid: [
        { key: "attention", suffix: "に意識が向きやすい" },
        { key: "theme", suffix: "がテーマとして浮かびやすい" },
        { key: "rise", suffix: "が立ち上がりやすい" },
        { key: "weight", suffix: "の比重が上がりやすい" },
      ],
      deep: [
        { key: "maybe", suffix: "と感じる人もいるかもしれない" },
        { key: "before_words", suffix: "が先に鳴って、言葉が後から追いつく人もいるかもしれない" },
        { key: "before_explain", suffix: "が説明より先に立ち上がることもあるかもしれない" },
      ],
    },

    softeners: ["どちらでもよく", "決めなくてもよく", "結論を急がなくてもよく", "整理は後からでもよく"],
  },

  // ----------------------------
  // glue: “交差し”に代わる薄い接続（説明臭くならない）
  // ----------------------------
  glue: {
    pair: [
      "が並び",
      "が同時に動き",
      "が並走し",
      "が同席し",
      "が同じ場に置かれ",
    ],
    aspect_like: [
      "として触れやすく",
      "として表に出やすく",
      "として浮かびやすく",
      "として輪郭を取りやすく",
    ],
  },

  // ----------------------------
  // templates: A文（正本）を“毎日壊れない型”で固定
  // - ここが auto_compress の心臓
  // - 断定しない、指示しない、予測しない
  // ----------------------------
  templates: {
    /**
     * a_core: 1〜2文で “核” を置く（LINE daily core / render）
     * placeholders:
     *  {p1_role} {p2_role}  : planet.role
     *  {s1_tone} {s2_tone}  : sign.tone or sign.sora_short
     *  {aspect_core}        : aspects.core
     *  {aspect_sora}        : aspects.sora（短く）
     *  {glue_pair}          : glue.pair
     *  {glue_aspect}        : glue.aspect_like
     *  {noun_force}         : categories.force
     *  {noun_process}       : categories.process
     *  {noun_clarity}       : categories.clarity
     *  {noun_expression}    : categories.expression
     *  {tendency_suffix}    : categories.tendency.*.suffix
     */
    a_core: [
      // 型1：2要素＋空気（王道）
      "{p1_role}と{p2_role}{glue_pair}、{aspect_core}の{noun_force}として{glue_aspect}。{noun_expression}は{noun_process}の中で、{noun_clarity}を持ち{tendency_suffix}。",
      // 型2：空気→役割（サインが先に立つ）
      "{s1_tone}空気の中で、{p1_role}が{glue_aspect}。{aspect_core}が絡むことで、{noun_expression}の{noun_clarity}が{tendency_suffix}。",
      // 型3：役割→プロセス（抽象を逃がしすぎない）
      "{p1_role}が前に出やすく、{p2_role}が背景で動きやすい配置。{noun_process}を通して、{noun_clarity}が{tendency_suffix}。",
      // 型4：最短（XやThreads向けの芯にも使える）
      "{aspect_core}の回路で、{p1_role}の{noun_force}が{tendency_suffix}。",
      // 型5：深層寄り（deepを選んだ時だけ使う想定）
      "{p1_role}の{noun_force}が、説明より先に鳴りやすい配置。{noun_expression}に出るまでに{noun_process}が挟まり{tendency_suffix}。",
    ],
  },

  // ----------------------------
  // selectors: どの部品を拾うか（重み付け）
  // - render/fusion はここを見て選ぶだけにする
  // ----------------------------
  selectors: {
    signFlavorPriority: ["tone", "sora_short", "core"],
    planetRolePriority: ["role", "core"],
    aspectLinePriority: ["core", "sora"],
  },

  // ----------------------------
  // weights: 媒体別に tendency を寄せたい時の重み（将来用）
  // ----------------------------
  weights: {
    tendency: { light: 0.7, mid: 0.25, deep: 0.05 },
  },
};

module.exports = { GRAMMARS_V1 };
