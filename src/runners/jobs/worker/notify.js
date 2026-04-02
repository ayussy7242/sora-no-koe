"use strict";

const { getFetch } = require("./utils");

async function linePush(accessToken, to, text) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (!to) throw new Error("line user id missing");
  const msg = String(text || "").trim();
  if (!msg) throw new Error("push text empty");

  const f = await getFetch();
  const res = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: msg.slice(0, 4800) }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return true;
}

module.exports = {
  linePush,
};
