"use strict";

/**
 * line.user.js
 *
 * 🌌 LINEユーザーと app_user_id の唯一の正本
 *
 * 原則：
 * - app_user_id を作るのはここだけ
 * - line_user_id → app_user_id は 1対1
 * - users / line_users は必ずトランザクションで同期
 */

const crypto = require("crypto");

function createLineUser({
    db,
    admin,
    config = {},
}) {
    if (!db) throw new Error("db is required");
    if (!admin) throw new Error("admin is required");

    const DEFAULT_TZ = config.DEFAULT_TZ || "Asia/Tokyo";
    const PROJECT = config.PROJECT || "sora-no-koe";
    const SCHEMA_VERSION = config.SCHEMA_VERSION || "1.0.0";

    // --------------------
    // helpers
    // --------------------
    function serverNow() {
        return admin.firestore.FieldValue.serverTimestamp();
    }

    function lineUserDocId(lineUserId) {
        return lineUserId;
    }

    function newAppUserId() {
        return `u_me_${crypto.randomBytes(10).toString("hex")}`;
    }

    // --------------------
    // get or create app_user_id (超重要)
    // --------------------
    async function getOrCreateAppUserId({
        lineUserId,
        lineProfile = null,
        eventType = "message",
    }) {
        if (!lineUserId) throw new Error("lineUserId is required");

        const lineRef = db.collection("line_users").doc(lineUserDocId(lineUserId));
        const now = serverNow();

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(lineRef);
            const existing = snap.exists ? snap.data() : null;

            // 既存があればそれを使う（最重要）
            const appUserId = existing?.app_user_id || newAppUserId();
            const userRef = db.collection("users").doc(appUserId);

            // users（正本）
            tx.set(
                userRef,
                {
                    status: "active",
                    profile: {
                        display_name:
                            lineProfile?.displayName ??
                            existing?.line_profile?.display_name ??
                            null,
                        timezone: DEFAULT_TZ,
                    },
                    channels: {
                        line: {
                            line_user_id: lineUserId,
                            linked_at: existing?.channels?.line?.linked_at ?? now,
                        },
                        email: null,
                    },
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                },
                { merge: true }
            );

            // line_users（参照）
            tx.set(
                lineRef,
                {
                    line_user_id: lineUserId,
                    app_user_id: appUserId,
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                    line_profile: {
                        display_name:
                            lineProfile?.displayName ??
                            existing?.line_profile?.display_name ??
                            null,
                        language:
                            lineProfile?.language ??
                            existing?.line_profile?.language ??
                            "ja",
                        picture_url:
                            lineProfile?.pictureUrl ??
                            existing?.line_profile?.picture_url ??
                            null,
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
                        personal_data:
                            existing?.consent?.personal_data ?? false,
                        public_share:
                            existing?.consent?.public_share ?? false,
                        version: existing?.consent?.version ?? 1,
                        agreed_at:
                            existing?.consent?.agreed_at ?? null,
                    },
                    status: existing?.status ?? "active",
                },
                { merge: true }
            );

            return appUserId;
        });
    }

    // --------------------
    // profile sync (軽量)
    // --------------------
    async function syncLineProfile({
        lineUserId,
        lineProfile,
        eventType = "message",
    }) {
        if (!lineUserId || !lineProfile) return;

        const ref = db.collection("line_users").doc(lineUserDocId(lineUserId));

        await ref.set(
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

    // --------------------
    // users.display_name 同期
    // --------------------
    async function syncUserDisplayName(appUserId, displayName) {
        if (!appUserId || !displayName) return;

        await db.collection("users").doc(appUserId).set(
            {
                updated_at: serverNow(),
                profile: {
                    display_name: displayName,
                    timezone: DEFAULT_TZ,
                },
            },
            { merge: true }
        );
    }

    // --------------------
    // public API
    // --------------------
    return {
        getOrCreateAppUserId,
        syncLineProfile,
        syncUserDisplayName,
    };
}

module.exports = {
    createLineUser,
};
