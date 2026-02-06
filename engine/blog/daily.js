"use strict";

const { createJaFormatters } = require("../render_parts/fmt_ja");
const dict = require("../../dict");
const { createChatCompletion } = require("./openai_client");

function normalizeAspectType(raw) {
  const x = String(raw || "").trim().toLowerCase();
  if (!x) return "";
  const base = x.replace(/_\d+$/, "");
  const map = {
    inconjunct: "quincunx_150",
    quincunx: "quincunx_150",
    semisquare: "semi_square_45",
    semi_square: "semi_square_45",
    sesquisquare: "sesqui_square_135",
    sesqui_square: "sesqui_square_135",
  };
  return map[base] || base;
}

const ASPECTS_META = {
  ...(dict?.ASPECTS_V2?.major || {}),
  ...(dict?.ASPECTS_V2?.deep_space || {}),
  ...(dict?.ASPECTS_V2?.craft_space || {}),
};

const ASPECTS_MAJOR_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.major || {}));
const ASPECTS_DEEP_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.deep_space || {}));
const ASPECTS_CRAFT_KEYS = new Set(Object.keys(dict?.ASPECTS_V2?.craft_space || {}));
const ASPECTS_RARE_PRI = new Set([
  "quintile_72",
  "biquintile_144",
  "septile_51",
  "biseptile_102",
  "triseptile_154",
  "sesqui_square_135",
]);

const OPENING_TONE_POOL = [
  "言葉にしきれない小さなズレ",
  "まだ名前のつかない違和感",
  "うまく言葉にならないざらつき",
  "静かに残る微細な引っかかり",
  "整理しきれない感触",
  "言い切れない手触り",
];

function hash32(input) {
  const s = String(input || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function uniqList(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function splitCoreWords(core) {
  return String(core || "")
    .split(/[・/／,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickBySeed(list, seed, count = 1) {
  const arr = Array.isArray(list) ? [...list] : [];
  if (!arr.length) return [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % arr.length;
    const v = arr[idx];
    if (used.has(v)) continue;
    used.add(v);
    out.push(v);
  }
  return out;
}

const fmt = createJaFormatters({
  META: {
    ASPECTS_META,
    PLANETS_META: dict?.PLANETS_V2?.bodies || {},
    POINTS_META: dict?.POINTS_V1?.points || {},
  },
  normalizeAspectType,
});

function signJa(signKey) {
  const k = String(signKey || "").toLowerCase();
  return dict?.SIGNS_V2?.signs?.[k]?.label_ja || signKey || "";
}

function aspectMeta(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_META?.[key] || null;
}

function getAspectByType(typeRaw) {
  return aspectMeta(typeRaw);
}

function isRareAspect(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  return ASPECTS_DEEP_KEYS.has(key) || ASPECTS_CRAFT_KEYS.has(key);
}

function aspectRoleSentence(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "";
  if (meta.role_line) return meta.role_line;
  const core = String(meta.core || "").trim();
  if (!core) return "";
  return `${core}が残る角度`;
}

function aspectRoleEcho(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return "同じ質感が別の層にも残る";
  const core = String(meta.core || "").trim();
  if (!core) return "同じ質感が別の層にも残る";
  return `${core}の質感が、別の層にも静かに残る`;
}

function pickSecondaryAspect(all, primary) {
  const primaryKey = normalizeAspectType(primary?.type);
  const primarySig = `${primary?.a}-${primary?.b}-${primaryKey}`;

  const others = all.filter((x) => {
    const key = normalizeAspectType(x?.type);
    const sig = `${x?.a}-${x?.b}-${key}`;
    return sig !== primarySig;
  });

  const byOrb = [...others].sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  // 1) rare (deep/craft)
  const rare = byOrb.find((x) => isRareAspect(x?.type));
  if (rare) return rare;

  // 2) priority set (quintile / septile / sesqui, etc.)
  const pri = byOrb.find((x) => ASPECTS_RARE_PRI.has(normalizeAspectType(x?.type)));
  if (pri) return pri;

  // 3) different aspect type from primary
  const diff = byOrb.find((x) => normalizeAspectType(x?.type) !== primaryKey);
  if (diff) return diff;

  return null;
}

function dominantLabel(strata) {
  const elemCount = strata?.element_count || {};
  const modCount = strata?.modality_count || {};

  const pickTop = (obj) => {
    const entries = Object.entries(obj).filter(([k]) => k !== "unknown");
    if (!entries.length) return { key: "", top: 0, second: 0 };
    entries.sort((a, b) => b[1] - a[1]);
    return { key: entries[0][0], top: entries[0][1], second: entries[1]?.[1] ?? 0 };
  };

  const e = pickTop(elemCount);
  const m = pickTop(modCount);
  const clear =
    (e.top >= 5 || (e.top - e.second) >= 2) &&
    (m.top >= 5 || (m.top - m.second) >= 2);

  if (!clear) return "";

  const elemJa = dict?.ELEMENTS_V1?.elements?.[e.key]?.label_ja || "";
  const modJa = dict?.MODALITIES_V1?.modalities?.[m.key]?.label_ja || "";
  return [elemJa, modJa].filter(Boolean).join("×");
}

function aspectLabelWithDeg(typeRaw) {
  const meta = aspectMeta(typeRaw);
  if (!meta) return fmt.fmtAspectJa(typeRaw);
  const deg = Number.isFinite(meta.deg) ? `${meta.deg}°` : "";
  return deg ? `${meta.label_ja}（${deg}）` : meta.label_ja;
}

function pickList(list, limit = 3) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.slice(0, limit);
}

function planetTouch(planetKey) {
  const key = String(planetKey || "").toLowerCase();
  const p = dict?.SOAR_STYLE_V1?.planets?.[key];
  return pickList(p?.touch, 3);
}

function signTouch(signKey) {
  const key = String(signKey || "").toLowerCase();
  const s = dict?.SOAR_STYLE_V1?.signs?.[key];
  return pickList(s?.touch, 3);
}

function aspectVoice(typeRaw) {
  const key = normalizeAspectType(typeRaw);
  const v = dict?.ASPECTS_V2?.voice_templates?.[key];
  if (!v) return [];
  const parts = [v.touch, v.gap, v.rest].flat().filter(Boolean);
  return pickList(parts, 4);
}

function buildDailyDataBlock(story, maxItems = 5) {
  const pub = story?.public || {};
  const all = Array.isArray(pub.sky_all) ? [...pub.sky_all] : [];
  all.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  const rare = all.filter((x) => isRareAspect(x.type));
  rare.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));

  const picked = [];
  const pickedKey = new Set();
  const pushUnique = (x) => {
    const key = `${x?.a}-${x?.b}-${x?.type}-${x?.orb_deg}`;
    if (pickedKey.has(key)) return;
    pickedKey.add(key);
    picked.push(x);
  };

  rare.slice(0, Math.min(2, maxItems)).forEach(pushUnique);
  all.forEach((x) => {
    if (picked.length >= maxItems) return;
    pushUnique(x);
  });

  const list = picked.slice(0, maxItems);
  const seenAspect = new Set();

  const bodies = [];
  const seenBodies = new Set();
  for (const x of list) {
    for (const key of [x?.a, x?.b]) {
      const k = String(key || "").toLowerCase();
      if (!k || seenBodies.has(k)) continue;
      seenBodies.add(k);
      bodies.push(key);
    }
  }
  const aspects = list.map((x) => {
    const a = fmt.fmtAnyJa(x.a);
    const b = fmt.fmtAnyJa(x.b);
    const aS = signJa(x.a_sign_key || x.a_sign || x.aS);
    const bS = signJa(x.b_sign_key || x.b_sign || x.bS);
    const typeRaw = x.type || x.aspect || x.aspectType;
    const asp = aspectLabelWithDeg(typeRaw);
    const aspectKey = normalizeAspectType(typeRaw);
    const role = seenAspect.has(aspectKey) ? aspectRoleEcho(typeRaw) : aspectRoleSentence(typeRaw);
    seenAspect.add(aspectKey);
    const roleLine = role ? `角度の役割: ${role}` : "";
    const orb = Number.isFinite(x.orb_deg) ? x.orb_deg.toFixed(1) : "—";
    const meta = aspectMeta(typeRaw);
    const core = meta?.core ? `角度質感: ${meta.core}` : "";
    const feel = Array.isArray(meta?.feel) && meta.feel.length ? `触れ味: ${meta.feel.join(" / ")}` : "";
    const voice = aspectVoice(typeRaw);
    const voiceLine = voice.length ? `角度語彙: ${voice.join(" / ")}` : "";
    const pTouchA = planetTouch(x.a);
    const pTouchB = planetTouch(x.b);
    const sTouchA = signTouch(x.a_sign_key || x.a_sign || x.aS);
    const sTouchB = signTouch(x.b_sign_key || x.b_sign || x.bS);
    const pLine = pTouchA.length || pTouchB.length ? `惑星感触: ${[...pTouchA, ...pTouchB].join(" / ")}` : "";
  const sLine = sTouchA.length || sTouchB.length ? `サイン感触: ${[...sTouchA, ...sTouchB].join(" / ")}` : "";
  const extra = [core, feel].filter(Boolean).join(" / ");
  return [
    `${a}（${aS}）× ${b}（${bS}）｜${asp}（orb ${orb}°）`,
    roleLine ? `  ${roleLine}` : "",
      extra ? `  ${extra}` : "",
      voiceLine ? `  ${voiceLine}` : "",
      pLine ? `  ${pLine}` : "",
    sLine ? `  ${sLine}` : "",
  ].filter(Boolean).join("\n");
});

  const planetLines = bodies.map((bodyKey) => {
    const ja = fmt.fmtAnyJa(bodyKey);
    const signKey = pub?.transit_signs?.[String(bodyKey)?.toLowerCase()]?.sign_key;
    const signJaLabel = signJa(signKey || "");
    const pTouch = planetTouch(bodyKey);
    const sTouch = signTouch(signKey);
    const touch = [...pTouch, ...sTouch].filter(Boolean);
    const touchLine = touch.length ? `感触: ${touch.slice(0, 4).join(" / ")}` : "";
    return [`${ja}×${signJaLabel}`, touchLine].filter(Boolean).join(" / ");
  });

  const sky = pub.sky_strata || {};
  const e = sky.element_count || {};
  const m = sky.modality_count || {};
  const elements = `火${e.fire || 0} 地${e.earth || 0} 風${e.air || 0} 水${e.water || 0}`;
  const modalities = `活${m.cardinal || 0} 不${m.fixed || 0} 柔${m.mutable || 0}`;
  const moon = pub?.moon?.sign_ja || signJa(pub?.moon?.sign_key || "");

  return [
    `月：${moon}`,
    `要素：${elements}`,
    `区分：${modalities}`,
    "",
    "惑星×星座（中核）:",
    ...planetLines,
    "",
    "上位共鳴:",
    ...aspects.map((a) => `- ${a}`),
  ].join("\n");
}

function systemPrompt() {
  return [
    "あなたは「sora-no-koe BLOG 専用生成AI」です。",
    "",
    "あなたの役割は、占い記事を書くことでも、専門解説をすることでもありません。",
    "天体配置や占星構造を、人が“体感として理解できる位置”に、やさしく置きます。",
    "",
    "🚫 絶対にやってはいけないこと",
    "未来の断定（〜になる、〜が起こる）",
    "行動指示（〜すべき、〜すると良い）",
    "「示唆する」「象徴する」などの逃げ言葉の多用",
    "意味がわからない抽象表現",
    "読み手を導く・安心させるための結論",
    "教える・まとめる・回収する語り",
    "読者の体験を説明すること（心理・行動・選択の先回り）",
    "「のまま残る」「〜ことがある」「〜かもしれない」の多用",
    "「〜だろう」「〜ようだ」「例えば」「〜できる」を使うこと",
    "",
    "👉 「わからないまま置いておく勇気」を優先する。",
    "",
    "禁止語：",
    "示唆 / 暗示 / 意味 / 知られている / 興味深い / 解かれていない / 可能性 / 〜と言える / のまま残る / かもしれない / ことがある / だろう / ようだ / 例えば / できる",
    "",
    "推奨置換：",
    "示唆→置かれている / 暗示→残っている / 意味→構造",
    "知られている→観測される / 興味深い→目に入っている",
    "解かれていない→完全には処理されていない",
    "",
    "🧠 人間らしさ・sora-no-koe らしさの必須条件",
    "抽象的に逃げてはいけない。",
    "構造を書くときは必ず一度、",
    "・人がそれに触れたときの感触",
    "・生活や内面で起こりうるズレ",
    "・言葉になる手前の違和感",
    "のいずれかに触れる。",
    "ただし、それを説明・解釈・結論・意味づけで閉じない。",
    "「わかる」場所までは降りる。決めない。",
    "",
    "追加ルール（最重要）：",
    "読者がどう感じるかを言語化しない。",
    "「きっかけ」「助け」「変化」「気づき」という語を使わない。",
    "読者を主語にしない。",
    "状況・感触・余白を“未処理のまま”置く。",
    "抽象→抽象→抽象は不可。抽象→具体（感覚/場面）→余白の順にする。",
    "",
    "角度表記ルール：",
    "アスペクトは必ず日本語＋角度表記で書く（例：インコンジャンクト（150°））。",
    "",
    "🌱 ソラのこえ構文（最重要）",
    "① まず感触から書く",
    "② 次に構造を重ねる（惑星・星座・アスペクトは後から置く）",
    "③ 最後は開いたまま終える（まとめない／投げない）",
    "",
    "🪶 文体ルール",
    "冷たくしない。優しすぎない。詩的すぎない。会話調にしない。",
    "「〜かもしれない」を乱用しない。",
    "OK例：",
    "「〜というより、〜に近い」",
    "「気づくと、前と同じ置き方ができなくなっている」",
    "「処理しきれないまま残る感じ」",
    "「うまく言葉にならないが、確かにある」",
    "NG例：",
    "「示唆する構造としてある」",
    "「エネルギーが高まる」",
    "「気づきをもたらす」",
    "「〜することができる」",
    "",
    "絵文字・天体記号ルール",
    "目的は層の切り替え。記事全体で3〜5個まで。",
    "1段落につき最大1個。連続使用禁止。文末に盛らない。",
    "使用OK：☀️ 🌙 ☿️ ♀️ ♂️ ♃ ♄ ♅ ♆ ♇ / 補助：🔹 🌫 🪨 🪶 🪐",
    "",
    "文字数：最低1000字。推奨1500〜2000字。",
    "",
    "必須の締め文（改変禁止）：",
    "これは占いではありません。",
    "星は答えを示さず、構造だけを置いています。",
    "どう感じ、どう扱うかの主権は、常にあなたにあります。",
  ].join("\n");
}

function userPrompt({ dateLocal, dataBlock }) {
  const openingHints = OPENING_TONE_POOL.join(" / ");
  return [
    "以下の条件で、sora-no-koe BLOGの記事を書いてください。",
    "",
    "【記事タイプ】",
    "日次",
    "",
    "【テーマ】",
    `今日のソラ ${dateLocal}`,
    "",
    "【使用データ（全体）】",
    dataBlock,
    "",
    "【トーン】",
    "解釈しない / 判断しない / 導かない / 構造をやさしく置く",
    "",
    "【出力フォーマット】",
    "冒頭1〜2文は観測者の目線で、以下のような語を動的に使って触れる",
    `冒頭の言い回し候補: ${openingHints}`,
    "感触 → 構造 → 余白 の順で書く",
    "感触は具体（手触り・場面・ズレ）に1回必ず触れる",
    "構造は後置きで、説明せずに添える",
    "余白はまとめない／結論を出さない",
    "各アスペクトの直後に「角度の役割」1文を必ず置く（説明しない／固定文）",
    "見出しはMarkdownで書く（## / ###）",
    "必ずこの順で構成する：",
    "1) ## 今日の空の骨格",
    "2) ## 惑星×星座（中核）",
    "3) ## アスペクトの接触",
    "4) ## 今日の終わり方",
    "惑星×星座は本文の中核として短い段落を複数置く（例：☿水星×水瓶座）",
    "",
    "【文字数】",
    "1500〜2000字",
  ].join("\n");
}

function buildDailyTitle(story, dateLocal) {
  const fallback = `今日のソラ｜${dateLocal}`;
  const top = story?.public?.sky_top?.[0];
  if (!top) return fallback;

  const aspect = getAspectByType(top.type);
  const label = aspect?.label_ja;
  const deg = top?.aspect_deg;
  const core = aspect?.core;

  if (!label || !deg || !core) return fallback;

  const strata = story?.public?.sky_strata || {};
  const dom = dominantLabel(strata);
  const domLabel = dom ? `${dom} ` : "";

  const all = Array.isArray(story?.public?.sky_all) ? [...story.public.sky_all] : [];
  all.sort((a, b) => (a?.orb_deg ?? 99) - (b?.orb_deg ?? 99));
  const secondary = pickSecondaryAspect(all, top);
  const secLabel = secondary ? aspectLabelWithDeg(secondary.type) : "";
  const secSuffix = secLabel ? `＋${secLabel}` : "";

  const coreWords = splitCoreWords(core);
  const toneWords = uniqList([
    ...(aspect?.feel || []),
    ...aspectVoice(top.type),
  ]);
  const seed = hash32(`${dateLocal}-${normalizeAspectType(top.type)}`);
  const pickedCore = pickBySeed(coreWords, seed, 1);
  const pickedTone = pickBySeed(toneWords, seed + 3, 2);
  const words = uniqList([...pickedCore, ...pickedTone]).slice(0, 3);
  const coreLabel = words.length ? words.join("・") : core;

  return `今日のソラ｜${dateLocal} ― ${domLabel}${label}（${deg}°）${secSuffix}が残す${coreLabel}`;
}

async function generateDailyDraft({ story, dateLocal, openai }) {
  const dataBlock = buildDailyDataBlock(story, 5);
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt({ dateLocal, dataBlock }) },
  ];

  const text = await createChatCompletion({
    apiKey: openai.apiKey,
    baseUrl: openai.baseUrl,
    model: openai.model,
    messages,
    temperature: 0.7,
    maxTokens: 2200,
  });

  const closing = "これは占いではありません。\n星は答えを示さず、構造だけを置いています。\nどう感じ、どう扱うかの主権は、常にあなたにあります。";
  const cleaned = softenText(text);
  return enforceSingleClosing(cleaned, closing);
}

function softenText(text) {
  const s = String(text || "");
  const replacements = [
    [/示唆/g, "置かれている"],
    [/暗示/g, "残っている"],
    [/意味/g, "構造"],
    [/知られている/g, "観測される"],
    [/興味深い/g, "目に入っている"],
    [/解かれていない/g, "完全には処理されていない"],
    [/可能性/g, "余地"],
    [/と言える/g, "と置ける"],
    [/〜と言える/g, "〜と置ける"],
    [/状況/g, "状態"],
    [/きっかけ/g, "端緒"],
    [/助け/g, "支え"],
    [/変化/g, "移ろい"],
    [/気づき/g, "輪郭"],
    [/噛み合わなさを感じる/g, "噛み合わなさが残る"],
    [/噛み合わないまま並ぶ/g, "噛み合わなさが並ぶ"],
    [/生じている/g, "並んでいる"],
    [/生まれる/g, "残る"],
    [/起きる/g, "残る"],
    [/により/g, "その配置のまま"],
    [/ことによるもの/g, "として置かれている"],
    [/と感じる/g, "が残る"],
    [/感じることがある/g, "が残る"],
  ];

  let out = s;
  for (const [re, to] of replacements) out = out.replace(re, to);

  // まとめ口調の緩和
  out = out.replace(/つまり、/g, "");
  out = out.replace(/要するに、/g, "");

  // 禁止寄りの語尾を軽く削る
  out = out.replace(/かもしれない/g, "");
  out = out.replace(/こともある/g, "");
  out = out.replace(/だろう/g, "");
  out = out.replace(/ようだ/g, "");
  out = out.replace(/例えば、?/g, "");

  return out;
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enforceSingleClosing(text, closing) {
  const s = String(text || "").trim();
  if (!s) return closing;

  const closingLines = closing.split("\n").map((line) => line.trim());
  const closingPattern = closingLines
    .map((line) => escapeRegex(line))
    .join("\\s*\\n+\\s*");
  const closingRegex = new RegExp(closingPattern, "g");

  const body = s.replace(closingRegex, "").trim().replace(/\n+$/g, "").trim();
  return `${body}\n\n${closing}`.trim();
}

module.exports = { generateDailyDraft, buildDailyTitle };
