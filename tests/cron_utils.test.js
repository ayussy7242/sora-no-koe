"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { pickAsOfISO } = require("../src/usecases/cron/utils");

test("pickAsOfISO accepts query as_of with decoded plus in timezone offset", () => {
  const asOfISO = pickAsOfISO({
    q: { as_of: "2026-04-27T08:00:00 09:00" },
    b: {},
    dateLocal: "2026-04-27",
  });

  assert.equal(asOfISO, "2026-04-27T08:00:00+09:00");
});

test("pickAsOfISO accepts camelCase asOfISO", () => {
  const asOfISO = pickAsOfISO({
    q: { asOfISO: "2026-04-27T08:00:00+09:00" },
    b: {},
    dateLocal: "2026-04-27",
  });

  assert.equal(asOfISO, "2026-04-27T08:00:00+09:00");
});
