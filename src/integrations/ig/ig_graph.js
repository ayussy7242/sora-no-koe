"use strict";

const DEFAULT_GRAPH_BASE = "https://graph.facebook.com";

function cleanPath(path) {
  return String(path || "").replace(/^\/+/, "");
}

function buildUrl({ base = DEFAULT_GRAPH_BASE, version = "v19.0", path }) {
  const p = cleanPath(path);
  return `${base}/${version}/${p}`;
}

async function igRequest({
  accessToken,
  method = "GET",
  version = "v19.0",
  path,
  params = {},
  base = DEFAULT_GRAPH_BASE,
} = {}) {
  if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
  if (!path) throw new Error("IG path missing");

  const url = new URL(buildUrl({ base, version, path }));

  const payload = { ...(params || {}) };
  payload.access_token = accessToken;

  const upper = String(method || "GET").toUpperCase();
  let body = null;
  if (upper === "GET") {
    Object.entries(payload).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      url.searchParams.set(k, String(v));
    });
  } else {
    const form = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      form.set(k, String(v));
    });
    body = form.toString();
  }

  const res = await fetch(url.toString(), {
    method: upper,
    headers: upper === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (!res.ok || json?.error) {
    const msg = json?.error?.message || text || `IG API error ${res.status}`;
    const code = json?.error?.code || res.status;
    const type = json?.error?.type || "IG_API_ERROR";
    const detail = json?.error ? JSON.stringify(json.error) : "";
    const err = new Error(`${type} ${code}: ${msg}`);
    err.code = code;
    err.detail = detail;
    throw err;
  }

  return json;
}

async function createImageContainer({ igUserId, imageUrl, accessToken, version }) {
  if (!igUserId) throw new Error("IG_USER_ID missing");
  if (!imageUrl) throw new Error("imageUrl missing");
  const params = {
    image_url: imageUrl,
    is_carousel_item: "true",
  };
  return igRequest({
    accessToken,
    method: "POST",
    version,
    path: `${igUserId}/media`,
    params,
  });
}

async function createCarouselContainer({ igUserId, children, caption, accessToken, version }) {
  if (!igUserId) throw new Error("IG_USER_ID missing");
  if (!Array.isArray(children) || children.length === 0) throw new Error("children missing");
  const params = {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: caption || "",
  };
  return igRequest({
    accessToken,
    method: "POST",
    version,
    path: `${igUserId}/media`,
    params,
  });
}

async function publishMedia({ igUserId, creationId, accessToken, version }) {
  if (!igUserId) throw new Error("IG_USER_ID missing");
  if (!creationId) throw new Error("creationId missing");
  return igRequest({
    accessToken,
    method: "POST",
    version,
    path: `${igUserId}/media_publish`,
    params: { creation_id: creationId },
  });
}

async function getContainerStatus({ creationId, accessToken, version }) {
  if (!creationId) throw new Error("creationId missing");
  return igRequest({
    accessToken,
    method: "GET",
    version,
    path: `${creationId}`,
    params: { fields: "status_code,status" },
  });
}

async function waitForContainer({
  creationId,
  accessToken,
  version,
  timeoutMs = 120000,
  intervalMs = 2000,
} = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getContainerStatus({ creationId, accessToken, version });
    const code = String(status?.status_code || "").toUpperCase();
    if (code === "FINISHED") return { ok: true, status };
    if (code === "ERROR") return { ok: false, status, error: "container_error" };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: "timeout" };
}

module.exports = {
  igRequest,
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  getContainerStatus,
  waitForContainer,
};
