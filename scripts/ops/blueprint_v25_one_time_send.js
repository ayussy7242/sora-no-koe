#!/usr/bin/env node
"use strict";

require("../_load_env");

const { Storage } = require("@google-cloud/storage");
const env = require("../../src/config/env");
const dict = require("../../src/content/dict");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const { createLineApi } = require("../../src/integrations/line/line_api");
const { createBlueprintLightService } = require("../../src/usecases/blueprint_light");
const { createBlueprintLightStorage } = require("../../src/usecases/blueprint_light/storage");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function toBool(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  const v = String(val || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

const TEMPLATE = `🌌 ソラのこえより

｛ユーザーネーム｝さんの
星の設計図（Blueprint v25）をお届けします💫💫

｛ユーザーネーム｝さんの生まれた瞬間の天体配置をもとに、配置の重心やつながりをまとめた１枚のPDFになります⭐️

暇なときにみてもらえたら
嬉しい限りでございます🎁⭐️

もしよければ、
感想を3つだけ教えてほしいです🌟

1. 全体の印象はどうだった？（一言OK）
2. 特に「これいい！」って思ったページや部分ある〜？
3. 「ここもっとこうしてほしい」ってところある〜？

反応待ってます〜🪐✨️🌟💫

今後展開する「ソラのこえ＋」の最初の波紋になります〜！！

登録してくれた方に、無料で配るので
ぜひみんなにもシェアしてもらえたら嬉しいです！

こちらから開けます👇✨️`;

function applyNameTemplate(text, name) {
  const safeName = name || "お客さま";
  return String(text || "")
    .replaceAll("｛ユーザーネーム｝", safeName)
    .replaceAll("{ユーザーネーム}", safeName)
    .replaceAll("〇〇", safeName);
}

async function resolveDisplayName({ db, lineUser }) {
  const fromLine =
    lineUser?.line_profile?.display_name ||
    lineUser?.profile?.display_name ||
    lineUser?.display_name ||
    "";
  if (fromLine) return fromLine;
  const appUserId = lineUser?.app_user_id || null;
  if (!db || !appUserId) return "";
  try {
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return "";
    const ud = snap.data() || {};
    return (
      ud.display_name ||
      ud?.profile?.display_name ||
      ud?.channels?.line?.profile?.display_name ||
      ""
    );
  } catch (_) {
    return "";
  }
}

async function main() {
  const forceRegen = toBool(getArg("forceRegen") || getArg("force") || process.env.BLUEPRINT_REGEN);
  const dryRun = toBool(getArg("dry_run") || process.env.DRY_RUN);
  const limit = Number(getArg("limit") || 0);
  const targetLineUserId = getArg("line_user_id") || process.env.LINE_USER_ID || "";
  const targetSet = targetLineUserId
    ? new Set(
        String(targetLineUserId)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const db = getDb();
  const storage = new Storage();
  const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });

  const bucketName = env.GCS_BUCKET_BLUEPRINTS;
  if (!bucketName) throw new Error("GCS_BUCKET_BLUEPRINTS missing");
  const bucket = storage.bucket(bucketName);
  const blueprintStorage = createBlueprintLightStorage({
    bucket,
    urlExpireDays: Number(env.BLUEPRINT_URL_EXPIRES_DAYS || 7),
  });

  const lineToken = env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineToken && !dryRun) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  const lineApi = lineToken ? createLineApi({ accessToken: lineToken, maxText: env.MAX_LINE_TEXT }) : null;

  const lineRef = db.collection("line_users");
  const lineDocs = [];
  if (targetSet) {
    const targetIds = Array.from(targetSet);
    for (const id of targetIds) {
      const doc = await lineRef.doc(id).get();
      lineDocs.push(doc);
    }
  } else {
    const lineSnap = await lineRef.get();
    lineDocs.push(...lineSnap.docs);
  }

  const results = [];
  let processed = 0;

  for (const doc of lineDocs) {
    const lineUserId = doc.id;
    if (targetSet && !targetSet.has(lineUserId)) continue;
    if (limit && processed >= limit) break;
    processed += 1;
    if (targetSet && !doc.exists) {
      results.push({
        lineUserId,
        name: "",
        generated: false,
        sent: false,
        url: "",
        error: "line_user_not_found",
      });
      continue;
    }
    const lineUser = doc.data() || {};

    const result = {
      lineUserId,
      name: "",
      generated: false,
      sent: false,
      url: "",
      error: null,
    };

    try {
      const displayName = await resolveDisplayName({ db, lineUser });
      result.name = displayName || "お客さま";

      const gen = await blueprint.generateAndStore({
        lineUserId,
        variant: "mobile",
        forceRegen,
      });
      if (!gen?.ok) {
        throw new Error(gen?.error || gen?.code || "generate_failed");
      }
      result.generated = true;

      const signed = await blueprintStorage.getSignedUrl(lineUserId, "mobile");
      if (!signed?.ok || !signed?.url) {
        throw new Error(signed?.error || signed?.code || "signed_url_failed");
      }
      result.url = signed.url;

      if (!dryRun) {
        const text = applyNameTemplate(TEMPLATE, result.name);
        const templateMessage = {
          type: "template",
          altText: "星の設計図（Blueprint v25）はこちら",
          template: {
            type: "buttons",
            title: "星の設計図（Blueprint v25）",
            text: "📱スマホ版",
            actions: [
              {
                type: "uri",
                label: "📱 スマホ版",
                uri: result.url,
              },
            ],
          },
        };
        await lineApi.pushMessages(lineUserId, [
          { type: "text", text },
          templateMessage,
        ]);
        result.sent = true;
      }
    } catch (err) {
      result.error = String(err?.message || err);
    }

    results.push(result);
  }

  const failures = results.filter((r) => r.error);
  const success = results.filter((r) => !r.error);

  console.log("blueprint_v25_one_time_send done");
  console.log("total:", results.length, "success:", success.length, "failed:", failures.length);
  if (failures.length) {
    console.log("failures:");
    for (const f of failures) {
      console.log(`- ${f.lineUserId}: ${f.error}`);
    }
  }

  if (dryRun) {
    console.log("dry_run: true (no LINE messages sent)");
  }
  if (targetSet && results.length === 0) {
    console.log("warning: no matching line_user_id found for", Array.from(targetSet).join(","));
  }

  return { results, failures, success, dryRun };
}

main().catch((err) => {
  console.error("blueprint_v25_one_time_send failed", err);
  process.exit(1);
});
