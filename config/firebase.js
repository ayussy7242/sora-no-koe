"use strict";

/**
 * config/firebase.js
 * - firebase-admin の初期化をここに集約
 * - Firestore multi DB を getFirestore(app, databaseId) で統一
 * - 他の場所で admin.initializeApp() / getFirestore(...) をしない運用にする
 */


const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { FIRESTORE_DATABASE_ID } = require("./env");

function getAdminApp() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
  }
  return admin.app();
}

function getDb(databaseId = FIRESTORE_DATABASE_ID) {
  const app = getAdminApp();
  return getFirestore(app, databaseId);
}

module.exports = { admin, getAdminApp, getDb };
