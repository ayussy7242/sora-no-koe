"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/server/app");

function createFakeDb() {
  return {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: false, data: () => null };
            },
          };
        },
      };
    },
  };
}

function createFakeDeps(envOverrides = {}) {
  const noop = () => ({ ok: true });
  const renderers = {
    renderLine: noop,
    renderSoraLine: noop,
    renderDistributionLine: noop,
    renderNatalListFromcache: noop,
    renderX: noop,
    renderXMorning: noop,
    renderXNight: noop,
    renderXResonance: noop,
    renderXMoonEvent: noop,
    renderXMonthly: noop,
    renderXThread: noop,
    renderIG: noop,
    renderThreads: noop,
  };

  return {
    env: { ...envOverrides },
    db: createFakeDb(),
    admin: { firestore: { FieldValue: { serverTimestamp: () => new Date() } } },
    swisseph: {},
    storyService: {
      buildStoryForUser: async () => ({ outputs: {} }),
      computeTransitsSwiss: () => ({}),
    },
    renderers,
    storage: {},
    dict: require("../src/content/dict"),
  };
}

function createMockReq({ headers = {}, url = "/meta" } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: lower,
    originalUrl: url,
    header(name) {
      return lower[String(name).toLowerCase()] || null;
    },
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runRouteHandlers(route, req, res) {
  const handlers = route.stack.map((layer) => layer.handle);
  let idx = 0;
  return new Promise((resolve, reject) => {
    const next = (err) => {
      if (err) return reject(err);
      const handler = handlers[idx++];
      if (!handler) return resolve();
      try {
        let advanced = false;
        const wrappedNext = (nextErr) => {
          advanced = true;
          next(nextErr);
        };
        const out = handler(req, res, wrappedNext);
        if (out && typeof out.then === "function") {
          out.then(() => resolve()).catch(reject);
          return;
        }
        if (!advanced) resolve();
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
}

function getMetaRoute(app) {
  return app._router.stack.find((layer) => layer.route?.path === "/meta")?.route || null;
}

test("/meta is public in non-production", async () => {
  const app = createApp(createFakeDeps({ NODE_ENV: "development" }));
  const route = getMetaRoute(app);
  assert.ok(route, "meta route should exist");

  const res = createMockRes();
  await runRouteHandlers(route, createMockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
});

test("/meta is restricted in production without debug token", async () => {
  const app = createApp(createFakeDeps({ NODE_ENV: "production", DEBUG_TOKEN: "DEBUG_TOKEN" }));
  const route = getMetaRoute(app);
  assert.ok(route, "meta route should exist");

  const res = createMockRes();
  await runRouteHandlers(route, createMockReq(), res);
  assert.equal(res.statusCode, 404);
});

test("/meta allows access with debug token in production", async () => {
  const app = createApp(createFakeDeps({ NODE_ENV: "production", DEBUG_TOKEN: "DEBUG_TOKEN" }));
  const route = getMetaRoute(app);
  assert.ok(route, "meta route should exist");

  const res = createMockRes();
  await runRouteHandlers(
    route,
    createMockReq({ headers: { Authorization: "Bearer DEBUG_TOKEN" } }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
});
