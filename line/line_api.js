"use strict";

function createLineApi({ accessToken, maxText = 4800 } = {}) {
  if (!accessToken) throw new Error("LINE access token missing");

  async function lineApi(path, { method = "POST", body = null } = {}) {
    if (typeof fetch !== "function") throw new Error("fetch is not available (Node18+ required)");

    const r = await fetch(`https://api.line.me${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`LINE API error ${r.status} ${t}`);
    }

    const txt = await r.text().catch(() => "");
    try {
      return txt ? JSON.parse(txt) : null;
    } catch {
      return null;
    }
  }

  async function replyText(replyToken, text, { toSafeText, isNonEmptyText } = {}) {
    if (!replyToken) return;
    const safe = toSafeText ? toSafeText(text, maxText) : String(text || "");
    if (isNonEmptyText && !isNonEmptyText(safe)) return;

    await lineApi("/v2/bot/message/reply", {
      method: "POST",
      body: { replyToken, messages: [{ type: "text", text: safe }] },
    });
  }

  async function getProfile(lineUserId) {
    if (!lineUserId) return null;
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    return await r.json();
  }

  return { lineApi, replyText, getProfile };
}

module.exports = { createLineApi };
