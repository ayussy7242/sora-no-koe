"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { pickResonanceDailyRepresentative } = require("../src/domain/resonance");

function buildStoryWithCandidates() {
  return {
    meta: { date_local: "2026-04-13" },
    public: {
      sky_all: [
        // Candidate A: hits exact at 12:00 JST (orb -> 0)
        { a: "sun", b: "moon", type: "conjunction", aspect_deg: 0, orb_deg: 0.9 },
        // Candidate B: never gets as close (min orb stays > 0.2)
        { a: "venus", b: "mars", type: "square", aspect_deg: 90, orb_deg: 0.3 },
      ],
      sky_top: [],
    },
  };
}

test("pickResonanceDailyRepresentative picks smallest daily peak orb", () => {
  const story = buildStoryWithCandidates();

  // Fake longitudes so:
  // - sun/moon distance == 0 at 12:00 JST, else >= 10 deg away
  // - venus/mars distance == 90 +/- 0.25 deg at best (orb 0.25)
  const calcTransitLonFn = (bodyKey, asOfISO) => {
    const hourJst = Number(String(asOfISO).slice(11, 13));
    const isNoon = hourJst === 12;

    if (bodyKey === "sun") return 0;
    if (bodyKey === "moon") return isNoon ? 0 : 10;
    if (bodyKey === "venus") return 0;
    if (bodyKey === "mars") return isNoon ? 90.25 : 90.8;
    return 0;
  };

  const res = pickResonanceDailyRepresentative({
    story,
    dateLocal: "2026-04-13",
    resonanceMode: "core",
    stepMinutes: 60,
    calcTransitLonFn,
  });

  assert.equal(res.ok, true);
  assert.equal(res.candidate.a, "sun");
  assert.equal(res.candidate.b, "moon");
  assert.equal(res.daily_peak.best_at, "2026-04-13T12:00:00+09:00");
  assert.equal(res.daily_peak.best_orb_deg, 0);
});

