"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/server/app");
const { createDebugRouter } = require("../src/routes/debug");

function createFakeDb() {
  return {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: false, data: () => null };
            },
            async set() {},
            async delete() {},
          };
        },
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { empty: true, docs: [] };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      return fn({
        async get() {
          return { exists: false, data: () => null };
        },
        set() {},
      });
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

function matchLayer(layer, path) {
  if (!layer?.regexp) return false;
  if (layer.regexp.global) layer.regexp.lastIndex = 0;
  return layer.regexp.test(path);
}

function hasDebugLayer(app) {
  return app._router.stack.some((layer) => layer?.name === "router" && matchLayer(layer, "/debug/ping"));
}

function createMockReq({ headers = {}, query = {}, url = "/debug/ping" } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: lower,
    query,
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

test("debug router mounts only when DEBUG is on", () => {
  const appOff = createApp(createFakeDeps({ DEBUG: "0", DEBUG_TOKEN: "DEBUG_TOKEN" }));
  assert.equal(hasDebugLayer(appOff), false);

  const appOn = createApp(createFakeDeps({ DEBUG: "1", DEBUG_TOKEN: "DEBUG_TOKEN" }));
  assert.equal(hasDebugLayer(appOn), true);
});

test("debug ping requires header auth", async () => {
  const router = createDebugRouter(createFakeDeps({ DEBUG_TOKEN: "DEBUG_TOKEN" }));
  const pingLayer = router.stack.find((layer) => layer.route?.path === "/ping");
  assert.ok(pingLayer, "debug /ping route should exist");

  const resNoAuth = createMockRes();
  await runRouteHandlers(pingLayer.route, createMockReq(), resNoAuth);
  assert.equal(resNoAuth.statusCode, 401);

  const resAuth = createMockRes();
  await runRouteHandlers(
    pingLayer.route,
    createMockReq({ headers: { Authorization: "Bearer DEBUG_TOKEN" } }),
    resAuth
  );
  assert.equal(resAuth.statusCode, 200);
  assert.equal(resAuth.body?.ok, true);
});
