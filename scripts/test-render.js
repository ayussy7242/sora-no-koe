"use strict";

/**
 * scripts/test-render.js
 *
 * 目的：
 * - renderLine / renderX / renderIG が落ちないか
 * - transit_signs が無くても星座が出るか
 * - public / personal 両方で render が通るか
 * - LINE 文字数制限以内か
 *
 * 方針：
 * - Webhook / LINE API は一切使わない
 * - renderer + copy + dict の統合テスト
 */

const path = require("path");

// --------------------
// imports（実パス）
// --------------------
const { createRenderers } = require(path.resolve(__dirname, "../engine/render"));
const dict = require(path.resolve(__dirname, "../dict"));

// --------------------
// mock stories
// --------------------
function makeStoryPublicNoTransitSigns() {
  return {
    meta: {
      date_local: "2026-01-04",
      rules: { orb_max_deg: 6 },
      user_id: "u_test_public",
    },
    public: {
      moon: { sign_ja: "双子座", sign_key: "gemini" },

      // 経度だけ与えて sign 推定が効くかを見る
      transit: { bodies: { Sun: 280.2, Moon: 92.1, Mercury: 5.0 } },

      // public sky_top（aspect_deg 入れておくと表示がキレイ）
      sky_top: [
        { a: "Sun", b: "Moon", type: "square", aspect_deg: 90, orb_deg: 1.2 },
        { a: "Venus", b: "Mars", type: "trine", aspect_deg: 120, orb_deg: 2.4 },
        { a: "Mercury", b: "Jupiter", type: "sextile", aspect_deg: 60, orb_deg: 3.1 },
      ],
    },
    personal: null,
  };
}

function makeStoryPersonalTop3() {
  return {
    meta: {
      date_local: "2026-01-04",
      rules: { orb_max_deg: 6 },
      user_id: "u_test_personal",
    },
    public: {
      moon: { sign_ja: "双子座", sign_key: "gemini" },
    },
    personal: {
      touch_points_top3: [
        {
          natal_body_or_point: "Sun",
          transit_body: "Moon",
          aspect: "square",
          aspect_deg: 90,
          orb_deg: 1.1,
          natal_sign_ja: "獅子座",
          transit_sign_ja: "双子座",
        },
        {
          natal_body_or_point: "ASC",
          transit_body: "Venus",
          aspect: "trine",
          aspect_deg: 120,
          orb_deg: 2.3,
          natal_sign_ja: "蠍座",
          transit_sign_ja: "山羊座",
        },
        {
          natal_body_or_point: "MC",
          transit_body: "Mars",
          aspect: "sextile",
          aspect_deg: 60,
          orb_deg: 3.2,
          natal_sign_ja: "獅子座",
          transit_sign_ja: "魚座",
        },
      ],
    },
  };
}

// --------------------
// run
// --------------------
function run() {
  // ✅ dict をちゃんと渡す（統合テストの肝）
  const renderers = createRenderers({ dict });

  // ---------- PUBLIC ----------
  const storyPublic = makeStoryPublicNoTransitSigns();
  const linePublic = renderers.renderLine(storyPublic);
  const xPublic = renderers.renderX(storyPublic);
  const igPublic = renderers.renderIG(storyPublic);

  console.log("\n=== PUBLIC LINE ===\n");
  console.log(linePublic);
  console.log("\n[PUBLIC LINE length]", linePublic.length);

  console.log("\n=== PUBLIC X ===\n");
  console.log(xPublic);

  console.log("\n=== PUBLIC IG ===\n");
  console.log(igPublic);

  // ---------- PERSONAL ----------
  const storyPersonal = makeStoryPersonalTop3();
  const linePersonal = renderers.renderLine(storyPersonal);

  console.log("\n=== PERSONAL LINE ===\n");
  console.log(linePersonal);
  console.log("\n[PERSONAL LINE length]", linePersonal.length);

  // ---------- length guard ----------
  const MAX = 4800;
  if (linePublic.length > MAX) throw new Error(`PUBLIC LINE too long: ${linePublic.length}`);
  if (linePersonal.length > MAX) throw new Error(`PERSONAL LINE too long: ${linePersonal.length}`);

  console.log("\n✅ render ok / length ok");
}

run();
