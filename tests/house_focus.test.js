"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  pickLeadingHouseFocus,
  formatLeadingHouseFocus,
} = require("../src/presenters/shared/house_focus");
const { pickObservationLine } = require("../src/presenters/format/ig_caption");
const dict = require("../src/content/dict");

test("pickLeadingHouseFocus includes second house when counts are close", () => {
  const selected = pickLeadingHouseFocus({
    total: 10,
    top: [
      { house_no: 3, count: 4 },
      { house_no: 11, count: 3 },
      { house_no: 8, count: 1 },
    ],
  });

  assert.deepEqual(
    selected.map((row) => row.house_no),
    [3, 11]
  );
});

test("formatLeadingHouseFocus renders combined house labels when counts are close", () => {
  const label = formatLeadingHouseFocus({
    total: 10,
    top: [
      { house_no: 3, count: 4 },
      { house_no: 11, count: 3 },
    ],
  });

  assert.equal(label, "第3ハウスと第11ハウス（4・3/10）");
});

test("pickObservationLine mentions both houses when house focus is near-tied", () => {
  const line = pickObservationLine({
    dict,
    transitSigns: {},
    skyStrata: {},
    houseFocus: {
      total: 10,
      top: [
        { house_no: 3, count: 4 },
        { house_no: 11, count: 3 },
      ],
    },
  });

  assert.match(line, /第3・11ハウス/);
});
