"use strict";

/**
 * routes/line.js
 *
 * LINE Webhook 最終統合レイヤー
 * - rawBody / signature 検証
 * - intent 判定
 * - user / natal / story を順に接続
 * - ここでは「判断しない」
 */

const express = require("express");
const crypto = require("crypto");

const { intentFromCommand } = require("../line/line.intent");
const { getOrCreateAppUser } = require("../line/line.user");
const { handleNatalFlow } = require("../line/line.natal");
const { createLineStory } = require("../line/line.story");

module.exports = function createLineRoute({
  lineClient,
  storyService,
  renderers,
  config = {},
}) {
  const router = express.Router();

  // ==================================================
  // raw body 保存（署名検証用）
  // ==================================================
  router.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // ==================================================
  // LINE webhook
  // ==================================================
  router.post("/webhook", async (req, res) => {
    try {
      // --------------------
      // signature verify
      // --------------------
      const signature = req.headers["x-line-signature"];
      const body = req.rawBody;

      const hash = crypto
        .createHmac("sha256", process.env.LINE_CHANNEL_SECRET)
        .update(body)
        .digest("base64");

      if (hash !== signature) {
        return res.status(401).send("invalid signature");
      }

      // --------------------
      // event loop
      // --------------------
      const events = req.body.events || [];
      for (const event of events) {
        if (event.type !== "message") continue;
        if (event.message.type !== "text") continue;

        const lineUserId = event.source.userId;
        const text = event.message.text.trim();

        // --------------------
        // intent（唯一の判定点）
        // --------------------
        const intent = intentFromCommand(text);

        // --------------------
        // user
        // --------------------
        const user = await getOrCreateAppUser({
          lineUserId,
          lineClient,
        });

        // --------------------
        // natal flow（必要ならここで止まる）
        // --------------------
        const natalResult = await handleNatalFlow({
          intent,
          user,
          text,
        });

        if (natalResult?.replyText) {
          await lineClient.replyMessage(event.replyToken, {
            type: "text",
            text: natalResult.replyText,
          });
          continue;
        }

        // --------------------
        // story layer
        // --------------------
        const story = createLineStory({
          storyService,
          renderers,
          config,
        });

        let result;

        if (intent === "public_sky") {
          result = await story.buildPublicSky();
        } else if (intent === "personal_today") {
          result = await story.buildPersonalToday({
            appUserId: user.appUserId,
          });
        } else {
          result = await story.buildPublicWithGuide();
        }

        // --------------------
        // reply
        // --------------------
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: result.text,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("LINE webhook error", err);
      res.status(500).send("internal error");
    }
  });

  return router;
};
