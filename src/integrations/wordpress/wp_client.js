"use strict";

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || "").trim();
  return s.replace(/\/+$/, "");
}

function buildAuthHeader(user, appPassword) {
  const token = Buffer.from(`${user}:${appPassword}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function createWpClient({ baseUrl, user, appPassword }) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("WP_BASE_URL is required");
  if (!user) throw new Error("WP_USER is required");
  if (!appPassword) throw new Error("WP_APP_PASSWORD is required");

  const auth = buildAuthHeader(user, appPassword);

  async function request(path, { method = "GET", body = null, headers: extraHeaders = null } = {}) {
    const url = `${base}${path}`;
    const headers = {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (extraHeaders && typeof extraHeaders === "object") {
      Object.assign(headers, extraHeaders);
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    if (!res.ok) {
      const msg = json?.message || text || `HTTP ${res.status}`;
      const err = new Error(`WP request failed (${res.status}): ${msg}`);
      err.status = res.status;
      err.response = json;
      err.body = text;
      err.url = url;
      throw err;
    }
    return json;
  }

  async function getPostBySlug(slug) {
    const s = encodeURIComponent(String(slug || "").trim());
    const path = `/wp-json/wp/v2/posts?slug=${s}&per_page=1`;
    const list = await request(path, { method: "GET" });
    return Array.isArray(list) && list.length ? list[0] : null;
  }

  async function createPost(payload) {
    return request("/wp-json/wp/v2/posts", { method: "POST", body: payload });
  }

  async function updatePost(id, payload) {
    return request(`/wp-json/wp/v2/posts/${id}`, { method: "POST", body: payload });
  }

  async function uploadMedia({ filename, buffer, mimeType = "image/jpeg" } = {}) {
    if (!buffer || !filename) {
      throw new Error("uploadMedia requires filename and buffer");
    }
    const safeName = String(filename).replace(/[^\w.\-]/g, "_");
    const headers = {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
    };
    const url = `${base}/wp-json/wp/v2/media`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: auth, ...headers },
      body: buffer,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    if (!res.ok) {
      const msg = json?.message || text || `HTTP ${res.status}`;
      const err = new Error(`WP media upload failed (${res.status}): ${msg}`);
      err.status = res.status;
      err.response = json;
      err.body = text;
      err.url = url;
      throw err;
    }
    return json;
  }

  async function updateMedia(id, payload) {
    return request(`/wp-json/wp/v2/media/${id}`, { method: "POST", body: payload });
  }

  return { getPostBySlug, createPost, updatePost, uploadMedia, updateMedia };
}

module.exports = { createWpClient };
