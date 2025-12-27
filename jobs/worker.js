async function handleJobsWorker(req, res) {
  // queued を1件だけ拾う（まずは単純に）
  const q = await db.collection("jobs_natal_calc")
    .where("status", "==", "queued")
    .orderBy("created_at", "asc")
    .limit(1)
    .get();

  if (q.empty) return ok(res, { ran: true, processed: 0 });

  const doc = q.docs[0];
  const job = doc.data();
  const ref = doc.ref;

  // running にする（雑でも可。強くしたければトランザクションでロック）
  await ref.set({
    status: "running",
    attempts: (job.attempts || 0) + 1,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  try {
    // ★ここで natal_cache を作る
    // 今は仮：既存の natal_cache があるならスキップ、無ければ作る
    const appUserId = job.app_user_id;
    const cacheRef = db.collection("natal_cache").doc(appUserId);
    const cacheSnap = await cacheRef.get();

    if (!cacheSnap.exists) {
      // TODO: 本番は swisseph 計算結果を入れる
      await cacheRef.set({
        computed_at: admin.firestore.FieldValue.serverTimestamp(),
        engine: { ephemeris_source: "swisseph" },
        natal_positions: {}, // TODO
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await ref.set({
      status: "done",
      last_error: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return ok(res, { ran: true, processed: 1, job_id: doc.id, app_user_id: appUserId });

  } catch (e) {
    await ref.set({
      status: "failed",
      last_error: String(e),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return bad(res, 500, "job failed", { job_id: doc.id, error: String(e) });
  }
}