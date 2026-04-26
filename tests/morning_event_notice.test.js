"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMorningEventNotice } = require("../src/presenters/shared/text/morning_event_notice");
const { buildSkyEventMeta } = require("../src/usecases/story/sky_event_meta");
const dict = require("../src/content/dict");

test("morning event notice uses morning fixed reference time rather than current as_of", () => {
  const story = {
    meta: {
      date_local: "2026-04-26",
      as_of: "2026-04-26T23:00:00+09:00",
    },
    public: {
      date_local: "2026-04-26",
      kinjitsu: [],
    },
  };

  const skyEventMeta = buildSkyEventMeta({
    story,
    dict,
    deps: {
      findNextMoonSignChangeDetailed: ({ asOfISO }) => {
        assert.equal(asOfISO, "2026-04-26T08:00:00+09:00");
        return {
          date: new Date("2026-04-26T09:48:00+09:00"),
          to: { label: "双子座" },
          hoursAhead: 1.8,
        };
      },
      buildNextMoonEvents: () => ({}),
      orderedMoonEvents: () => [],
      calcTransitLon: () => null,
    },
  });

  const lines = buildMorningEventNotice(story, {
    dict,
    skyEventMeta,
  });

  assert.match(lines[0], /このあと 0?9:48ごろ、月は双子座へ移ります🌙/);
});

test("sky event meta includes upcoming planet ingresses for debug output", () => {
  const story = {
    meta: {
      date_local: "2026-04-26",
      as_of: "2026-04-26T23:00:00+09:00",
    },
    public: {
      date_local: "2026-04-26",
      kinjitsu: [],
    },
  };

  const skyEventMeta = buildSkyEventMeta({
    story,
    dict,
    deps: {
      findNextMoonSignChangeDetailed: () => null,
      buildNextMoonEvents: () => ({}),
      orderedMoonEvents: () => [],
      calcTransitLon: (bodyKey, iso) => {
        const time = new Date(iso).getTime();
        const switchAt = new Date("2026-04-26T13:12:00+09:00").getTime();
        if (bodyKey === "mercury") return time >= switchAt ? 31 : 29;
        return null;
      },
    },
  });

  assert.equal(Array.isArray(skyEventMeta.nextPlanetSignIngress), true);
  assert.equal(skyEventMeta.nextPlanetSignIngress[0].planet, "mercury");
  assert.equal(skyEventMeta.nextPlanetSignIngress[0].toSign, "牡牛座");
});

test("sky event meta limits morning events to six hours from morning reference", () => {
  const story = {
    meta: {
      date_local: "2026-04-26",
      as_of: "2026-04-26T23:00:00+09:00",
    },
    public: {
      date_local: "2026-04-26",
      kinjitsu: [],
    },
  };

  const skyEventMeta = buildSkyEventMeta({
    story,
    dict,
    deps: {
      findNextMoonSignChangeDetailed: () => ({
        date: new Date("2026-04-26T15:30:00+09:00"),
        to: { label: "蟹座" },
        hoursAhead: 7.5,
      }),
      buildNextMoonEvents: () => ({}),
      orderedMoonEvents: () => [],
      calcTransitLon: () => null,
    },
  });

  assert.equal(skyEventMeta.maxHours, 6);
  assert.equal(skyEventMeta.nextMoonSignChange, null);
});
