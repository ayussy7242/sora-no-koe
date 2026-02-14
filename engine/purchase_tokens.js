"use strict";

function tokenCharset() {
  // 紛らわしい文字を避ける（0/O, 1/I など）
  return "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
}

function randomToken(length = 10) {
  const chars = tokenCharset();
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    out += chars[idx];
  }
  return out;
}

async function createPurchaseToken({ db, admin, lineUserId, product, length = 10, maxRetries = 6 }) {
  if (!db) throw new Error("db is required");
  if (!admin) throw new Error("admin is required");
  if (!lineUserId) throw new Error("lineUserId is required");
  if (!product) throw new Error("product is required");

  const now = admin.firestore.FieldValue.serverTimestamp();

  for (let i = 0; i < maxRetries; i += 1) {
    const token = randomToken(length);
    const ref = db.collection("purchase_tokens").doc(token);
    try {
      await ref.create({
        line_user_id: lineUserId,
        product,
        created_at: now,
        used: false,
        used_at: null,
        stripe_session_id: null,
      });
      return token;
    } catch (e) {
      // ALREADY_EXISTS: retry
      if (e?.code === 6 || /already exists/i.test(String(e?.message || ""))) {
        continue;
      }
      throw e;
    }
  }

  throw new Error("purchase token generation failed");
}

async function getPurchaseToken({ db, token }) {
  if (!db) throw new Error("db is required");
  if (!token) throw new Error("token is required");
  const ref = db.collection("purchase_tokens").doc(token);
  const snap = await ref.get();
  return { exists: snap.exists, data: snap.exists ? snap.data() : null, ref };
}

module.exports = { createPurchaseToken, getPurchaseToken };
