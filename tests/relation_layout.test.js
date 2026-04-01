"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chunkTwoColumns,
  splitTwoColumns,
  chunkList,
  buildPrefixSums,
  sumTail,
  calcBlockHeight,
  maxRowsFitFromEnd,
  paginateStackBlocksFromStart,
  paginateSingleListFromEnd,
  paginateDualListsFromEnd,
} = require("../src/engine/pdf/relation/layout");

test("chunkTwoColumns handles empty and chunks rows", () => {
  assert.deepEqual(chunkTwoColumns([], 3), [{ left: ["—"], right: ["—"] }]);

  const list = ["a", "b", "c", "d", "e"];
  const out = chunkTwoColumns(list, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { left: ["a", "b"], right: ["c", "d"] });
  assert.deepEqual(out[1], { left: ["e"], right: [] });
});

test("splitTwoColumns splits roughly in half", () => {
  assert.deepEqual(splitTwoColumns([]), { left: ["—"], right: ["—"] });
  assert.deepEqual(splitTwoColumns([1, 2, 3, 4, 5]), { left: [1, 2, 3], right: [4, 5] });
});

test("chunkList groups into fixed sizes", () => {
  assert.deepEqual(chunkList([], 3), [[]]);
  assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("prefix sums and tail sums", () => {
  const sums = buildPrefixSums([1, 2, 3]);
  assert.deepEqual(sums, [0, 1, 3, 6]);
  assert.equal(sumTail(sums, 3, 2), 5);
  assert.equal(sumTail(sums, 3, 0), 0);
});

test("calcBlockHeight computes with gaps", () => {
  const heights = [10, 12, 8];
  const sums = buildPrefixSums(heights);
  assert.equal(calcBlockHeight({ headHeight: 5, rowHeights: heights, gap: 2, endIndex: 3, count: 2, sums }), 5 + 12 + 8 + 2);
  assert.equal(calcBlockHeight({ headHeight: 5, rowHeights: heights, gap: 2, endIndex: 2, count: 0, sums }), 5);
});

test("maxRowsFitFromEnd respects head/gaps", () => {
  const count = maxRowsFitFromEnd({ rowHeights: [10, 10, 10], headHeight: 5, gap: 2, endIndex: 3, maxHeight: 27 });
  assert.equal(count, 2);
  const minOne = maxRowsFitFromEnd({ rowHeights: [10], headHeight: 100, gap: 2, endIndex: 1, maxHeight: 50 });
  assert.equal(minOne, 1);
});

test("paginateStackBlocksFromStart splits pages by height", () => {
  const pages = paginateStackBlocksFromStart({ blockHeights: [10, 10, 10], gap: 2, maxHeight: 22 });
  assert.deepEqual(pages, [{ start: 0, end: 2 }, { start: 2, end: 3 }]);
  assert.deepEqual(paginateStackBlocksFromStart({ blockHeights: [], gap: 2, maxHeight: 22 }), [{ start: 0, end: 0 }]);
});

test("paginateSingleListFromEnd paginates from tail", () => {
  const pages = paginateSingleListFromEnd({ rowHeights: [10, 10, 10], headHeight: 5, gap: 2, maxNoBottom: 22, maxWithBottom: 27 });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], { start: 0, end: 1, count: 1, isLast: false });
  assert.deepEqual(pages[1], { start: 1, end: 3, count: 2, isLast: true });
});

test("paginateDualListsFromEnd covers all rows", () => {
  const pages = paginateDualListsFromEnd({
    flowHeights: [10, 10],
    frictionHeights: [10],
    flowHeadHeight: 0,
    frictionHeadHeight: 0,
    flowGap: 0,
    frictionGap: 0,
    stackGap: 0,
    maxNoBottom: 25,
    maxWithBottom: 25,
  });

  const flowTotal = pages.reduce((sum, p) => sum + (p.flowCount || 0), 0);
  const frictionTotal = pages.reduce((sum, p) => sum + (p.frictionCount || 0), 0);
  assert.equal(flowTotal, 2);
  assert.equal(frictionTotal, 1);
  assert.equal(pages[pages.length - 1].isLast, true);
  pages.forEach((p) => {
    assert.equal(p.flowEnd - p.flowStart, p.flowCount);
    assert.equal(p.frictionEnd - p.frictionStart, p.frictionCount);
  });
});
