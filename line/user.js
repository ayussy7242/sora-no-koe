"use strict";

/**
 * line/user.js
 * 🌌 LINEユーザーと app_user_id の唯一の正本
 */

const crypto = require("crypto");

function createLineUser({ db, admin, config = {} }) {
    if (!db) throw new Error("db is required");
    if (!admin) throw new Error("admin is required");

    const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
    const PROJECT = config.PROJECT || "sora-no-koe";
    const SCHEMA_VERSION = config.SCHEMA_VERSION || "1.0.0";

    function serverNow() {
        return admin.firestore.FieldValue.serverTimestamp();
    }

    function newAppUserId() {
        return `u_me_${crypto.randomBytes(10).toString("hex")}`;
    }

    async function getOrCreateAppUserId({ lineUserId, lineProfile = null, eventType = "message" }) {
        if (!lineUserId) throw new Error("lineUserId is required");

        const lineRef = db.collection("line_users").doc(lineUserId);
        const now = serverNow();

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(lineRef);
            const existing = snap.exists ? snap.data() : null;

            const appUserId = existing?.app_user_id || newAppUserId();
            const userRef = db.collection("users").doc(appUserId);

            tx.set(
                userRef,
                {
                    // ✅ これが daily8 の where("status","==","active") を確実に通す
                    status: "active",

                    // ✅ こっちも統一（表示系や将来の条件で使うなら）
                    profile: {
                        status: "active",
                        display_name: lineProfile?.displayName ?? existing?.line_profile?.display_name ?? null,
                        timezone: DEFAULT_TZ,
                    },

                    channels: {
                        line: { line_user_id: lineUserId, linked_at: existing?.channels?.line?.linked_at ?? now },
                        email: null,
                    },
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                },
                { merge: true }
            );

            tx.set(
                lineRef,
                {
                    line_user_id: lineUserId,
                    app_user_id: appUserId,
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                    line_profile: {
                        display_name: lineProfile?.displayName ?? existing?.line_profile?.display_name ?? null,
                        language: lineProfile?.language ?? existing?.line_profile?.language ?? "ja",
                        picture_url: lineProfile?.pictureUrl ?? existing?.line_profile?.picture_url ?? null,
                        line_user_id: lineUserId,
                    },
                    meta: {
                        project: PROJECT,
                        schema_version: SCHEMA_VERSION,
                        last_event_type: eventType,
                        last_seen_at: now,
                    },
                    consent: {
                        profile: true,
                        personal_data: existing?.consent?.personal_data ?? false,
                        public_share: existing?.consent?.public_share ?? false,
                        version: existing?.consent?.version ?? 1,
                        agreed_at: existing?.consent?.agreed_at ?? null,
                    },
                    status: existing?.status ?? "active",
                },
                { merge: true }
            );

            return appUserId;
        });
    }

    async function syncLineProfile({ lineUserId, lineProfile, eventType = "message" }) {
        if (!lineUserId || !lineProfile) return;

        await db.collection("line_users").doc(lineUserId).set(
            {
                updated_at: serverNow(),
                line_profile: {
                    display_name: lineProfile.displayName ?? null,
                    language: lineProfile.language ?? "ja",
                    picture_url: lineProfile.pictureUrl ?? null,
                    line_user_id: lineUserId,
                },
                meta: {
                    project: PROJECT,
                    schema_version: SCHEMA_VERSION,
                    last_event_type: eventType,
                    last_seen_at: serverNow(),
                },
                consent: { profile: true },
            },
            { merge: true }
        );
    }

    async function syncUserDisplayName(appUserId, displayName) {
        if (!appUserId || !displayName) return;

        await db.collection("users").doc(appUserId).set(
            {
                updated_at: serverNow(),
                status: "active", // ← 正規はここだけ
                profile: {
                    display_name: displayName,
                    timezone: DEFAULT_TZ,
                },
            },
            { merge: true }
        );
    }


    return {
        getOrCreateAppUserId,
        syncLineProfile,
        syncUserDisplayName,
    };
}

module.exports = { createLineUser };
