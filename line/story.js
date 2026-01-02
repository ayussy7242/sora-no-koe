"use strict";

/**
 * line/story.js — Unified STABLE (v2026.01 unified)
 * - "today"  => mode:auto (natalあればpersonal、なければpublic-only)
 * - "sky"    => appUserId="public", mode:public
 * - utilities handled here (help/start/reset/cancel/test/ping)
 */

function createLineStory({ db, storyService, renderers, natal = null, config = {} }) {
  if (!db) throw new Error("db is required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser is required");
  if (!renderers?.renderLine) throw new Error("renderers.renderLine is required");

  const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
  const ORB_MAX_DEG = Number(config.ORB_MAX_DEG ?? 6);
  const PRECISION_DEG = Number(config.PRECISION_DEG ?? 0.01);
  const MAX_LINE_TEXT = Number(config.MAX_LINE_TEXT ?? 4800);

  const BOT_NAME = config.LINE_ACCOUNT_NAME || config.BOT_NAME || "ソラのこえ。｜今日の星を置く🌌";

  const TEXT = {
    HELP:
      "使い方🌌\n\n" +
      "■ コマンドは3つだけ\n" +
      "・「今日」/「きょう」：あなた基準の今日（登録済みなら personal / 未登録なら public）\n" +
      "・「そら」：空の構造だけ（public）\n" +
      "・「わたしのほし」：あなたのネイタル一覧（ASC/MC含む）\n\n" +
      "■ 個人版登録\n" +
      "・「はじめる」\n\n" +
      "登録で聞くもの（不明OK）\n" +
      "1) 生年月日（例：1990-07-24 / 19900724）\n" +
      "2) 出生時刻（例：12:18）\n" +
      "3) 出生地（例：札幌 / Yokohama / Tono, Iwate）",
    FALLBACK: "コマンドはこの3つだけだよ🌌\n「今日」/「きょう」\n「そら」\n「わたしのほし」\n\n個人版の登録は「はじめる」",
    START_NATAL:
      "個人版（あなたの回路）を登録するよ🌌\n\n" +
      "まずは【生年月日】を送ってね。\n" +
      "例：1990-07-24（または 19900724）\n\n" +
      "わからなければ「不明」でもOK。\n" +
      "やめるなら「やめる」",
    CANCELLED:
      "OK、登録は中断したよ🌌\n" +
      "またやるなら「はじめる」\n" +
      "今日だけ見るなら「そら」/「今日」",
    RESET_DONE: "ネイタル登録をリセットしたよ🌌\nもう一回やるなら「はじめる」",
    TEST_ACK: "OK🌌 受け取ったよ。\n「今日」/「そら」/「わたしのほし」\n登録は「はじめる」🕊️",
  };

  function safeText(s) {
    const x = s == null ? "" : String(s);
    return x.length > MAX_LINE_TEXT ? x.slice(0, MAX_LINE_TEXT) : x;
  }

  // timezone helpers (Intl only)
  function ymdInTimeZone(date, timeZone) {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(date);
  }

  function asOfIsoFromDateLocal(dateLocal) {
    // JST 12:00 == UTC 03:00
    return `${dateLocal}T03:00:00.000Z`;
  }

  function computeDateLocalAndAsOfISO() {
    const now = new Date();
    const dateLocal = ymdInTimeZone(now, DEFAULT_TZ);
    const asOfISO = asOfIsoFromDateLocal(dateLocal);
    return { dateLocal, asOfISO };
  }

  async function buildStory({ appUserId, mode }) {
    const { dateLocal, asOfISO } = computeDateLocalAndAsOfISO();
    const story = await storyService.buildStoryForUser({
      appUserId,
      mode, // "public" or "auto"
      dateLocal,
      asOfISO,
      orbMaxDeg: ORB_MAX_DEG,
      precisionDeg: PRECISION_DEG,
    });
    const text = safeText(renderers.renderLine(story));
    return { story, text };
  }

  async function buildSky() {
    return buildStory({ appUserId: "public", mode: "public" });
  }

  async function buildToday({ appUserId }) {
    return buildStory({ appUserId, mode: "auto" });
  }

  async function buildSkyWithGuide() {
    const { text } = await buildSky();
    const guide = "\n\n（あなた基準の“今日”は、LINE登録があると personal で返る🌌\nまず「はじめる」からどうぞ🕊️）";
    return { text: safeText(text + guide) };
  }

  function renderFallback() {
    return TEXT.FALLBACK;
  }

  function renderWelcome(profile) {
    const nickname = profile?.displayName || "あなた";
    return (
      `${nickname}さん\n` +
      `はじめまして！${BOT_NAME}です。\n` +
      "友だち追加ありがとう🛸✨\n\n" +
      "ここは「占い」じゃなくて、\n" +
      "今日の星の配置を“そのまま置く”場所。\n" +
      "解釈は、あなたのもの。\n\n" +
      "まずは👇\n\n" +
      "「はじめる」→ 個人版（あなたの回路）を登録\n" +
      "「そら」→ 空の構造だけ（public）\n" +
      "「使い方」→ ヘルプ\n\n" +
      "（わからないところは「不明」でOK）"
    );
  }

  // ---- natal list (わたしのほし) ----
  async function renderMyNatal(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    const d = snap.exists ? snap.data() : null;
    return safeText(renderers.renderNatalListFromCache(d));
  }

  // utilities layer handler
  async function handleUtilities({ cmd, appUserId }) {
    const c = String(cmd || "").trim();

    if (/^(ping)$/i.test(c)) return { text: "pong" };
    if (/^(test|てすと|テスト)$/i.test(c)) return { text: TEXT.TEST_ACK };
    if (/^(help|使い方|へるぷ)$/i.test(c)) return { text: TEXT.HELP };

    if (/^(やめる|中止|cancel|stop)$/i.test(c)) {
      if (appUserId && natal?.setNatalStage) await natal.setNatalStage(appUserId, natal.NATAL_STAGE.idle);
      return { text: TEXT.CANCELLED };
    }

    if (/^(リセット|reset|最初から|はじめから|最初からやり直す|はじめからやり直す)$/i.test(c)) {
      if (appUserId && natal?.resetNatal) await natal.resetNatal(appUserId);
      return { text: TEXT.RESET_DONE };
    }

    if (/^(はじめる|始める|start|begin)$/i.test(c)) {
      if (appUserId && natal?.setNatalStage) await natal.setNatalStage(appUserId, natal.NATAL_STAGE.birth_date);
      return { text: TEXT.START_NATAL };
    }

    return null;
  }

  return {
    buildSky,
    buildSkyWithGuide,
    buildToday,
    renderMyNatal,
    renderFallback,
    renderWelcome,
    handleUtilities,
  };
}

module.exports = { createLineStory };
