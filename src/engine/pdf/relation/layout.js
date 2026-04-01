"use strict";

const { MAX_ROWS_PER_COL } = require("./constants");

function chunkTwoColumns(list = [], rowsPerCol = MAX_ROWS_PER_COL) {
  const out = [];
  const chunkSize = rowsPerCol * 2;
  for (let i = 0; i < list.length; i += chunkSize) {
    const slice = list.slice(i, i + chunkSize);
    out.push({
      left: slice.slice(0, rowsPerCol),
      right: slice.slice(rowsPerCol),
    });
  }
  if (!out.length) out.push({ left: ["—"], right: ["—"] });
  return out;
}

function splitTwoColumns(list = []) {
  if (!list.length) return { left: ["—"], right: ["—"] };
  const mid = Math.ceil(list.length / 2);
  return { left: list.slice(0, mid), right: list.slice(mid) };
}

function chunkList(list = [], size = 6) {
  if (!list.length) return [[]];
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

function buildPrefixSums(list = []) {
  const sums = [0];
  for (const value of list) {
    sums.push(sums[sums.length - 1] + value);
  }
  return sums;
}

function sumTail(sums, endIndex, count) {
  if (!count) return 0;
  const start = Math.max(0, endIndex - count);
  return sums[endIndex] - sums[start];
}

function calcBlockHeight({ headHeight = 0, rowHeights = [], gap = 0, endIndex = rowHeights.length, count = rowHeights.length, sums = null } = {}) {
  const safeCount = Math.max(0, count);
  const totalRows = sums ? sumTail(sums, endIndex, safeCount) : rowHeights.slice(endIndex - safeCount, endIndex).reduce((a, b) => a + b, 0);
  if (!safeCount) return headHeight;
  return headHeight + totalRows + gap * Math.max(0, safeCount - 1);
}

function maxRowsFitFromEnd({ rowHeights = [], headHeight = 0, gap = 0, endIndex = rowHeights.length, maxHeight = 0 }) {
  let total = headHeight;
  let count = 0;
  for (let i = endIndex - 1; i >= 0; i--) {
    const rowHeight = rowHeights[i] || 0;
    const extraGap = count > 0 ? gap : 0;
    if (total + extraGap + rowHeight > maxHeight) break;
    total += extraGap + rowHeight;
    count += 1;
  }
  return Math.max(count, 1);
}

function paginateStackBlocksFromStart({ blockHeights = [], gap = 0, maxHeight = 0 }) {
  const pages = [];
  let start = 0;
  let total = 0;
  for (let i = 0; i < blockHeights.length; i += 1) {
    const h = blockHeights[i] || 0;
    const nextTotal = total ? total + gap + h : h;
    if (nextTotal <= maxHeight || start === i) {
      total = nextTotal;
      continue;
    }
    pages.push({ start, end: i });
    start = i;
    total = h;
  }
  if (blockHeights.length) pages.push({ start, end: blockHeights.length });
  if (!pages.length) pages.push({ start: 0, end: 0 });
  return pages;
}

function paginateSingleListFromEnd({ rowHeights = [], headHeight = 0, gap = 0, maxNoBottom = 0, maxWithBottom = 0 }) {
  const pages = [];
  let end = rowHeights.length;
  let isLast = true;
  while (end > 0) {
    const maxHeight = isLast ? maxWithBottom : maxNoBottom;
    const count = maxRowsFitFromEnd({ rowHeights, headHeight, gap, endIndex: end, maxHeight });
    const start = Math.max(0, end - count);
    pages.push({ start, end, count, isLast });
    end = start;
    isLast = false;
  }
  return pages.reverse();
}

function paginateDualListsFromEnd({
  flowHeights = [],
  frictionHeights = [],
  flowHeadHeight = 0,
  frictionHeadHeight = 0,
  flowGap = 0,
  frictionGap = 0,
  stackGap = 0,
  maxNoBottom = 0,
  maxWithBottom = 0,
}) {
  const flowSums = buildPrefixSums(flowHeights);
  const frictionSums = buildPrefixSums(frictionHeights);
  const pages = [];
  let flowEnd = flowHeights.length;
  let frictionEnd = frictionHeights.length;
  let isLast = true;

  const pickCounts = (maxHeight) => {
    const minFlow = flowEnd > 0 ? 1 : 0;
    const minFriction = frictionEnd > 0 ? 1 : 0;
    let best = null;

    for (let flowCount = minFlow; flowCount <= flowEnd; flowCount += 1) {
      const flowHeight = calcBlockHeight({
        headHeight: flowHeadHeight,
        rowHeights: flowHeights,
        gap: flowGap,
        endIndex: flowEnd,
        count: flowCount,
        sums: flowSums,
      });
      const needsStack = minFriction > 0;
      const remain = maxHeight - flowHeight - (needsStack ? stackGap : 0);
      if (remain < 0) continue;

      let bestFrictionCount = null;
      for (let frictionCount = frictionEnd; frictionCount >= minFriction; frictionCount -= 1) {
        const frictionHeight = calcBlockHeight({
          headHeight: frictionHeadHeight,
          rowHeights: frictionHeights,
          gap: frictionGap,
          endIndex: frictionEnd,
          count: frictionCount,
          sums: frictionSums,
        });
        if (frictionHeight <= remain) {
          bestFrictionCount = frictionCount;
          break;
        }
      }
      if (bestFrictionCount === null) continue;

      const frictionHeight = calcBlockHeight({
        headHeight: frictionHeadHeight,
        rowHeights: frictionHeights,
        gap: frictionGap,
        endIndex: frictionEnd,
        count: bestFrictionCount,
        sums: frictionSums,
      });
      const totalHeight = flowHeight + (bestFrictionCount > 0 ? stackGap + frictionHeight : 0);
      const totalRows = flowCount + bestFrictionCount;

      if (!best || totalRows > best.totalRows || (totalRows === best.totalRows && totalHeight > best.totalHeight)) {
        best = { flowCount, frictionCount: bestFrictionCount, totalRows, totalHeight };
      }
    }

    if (!best) {
      const fallbackFlow = flowEnd > 0 ? 1 : 0;
      const fallbackFriction = frictionEnd > 0 ? 1 : 0;
      return { flowCount: fallbackFlow, frictionCount: fallbackFriction };
    }
    return best;
  };

  while (flowEnd > 0 || frictionEnd > 0) {
    const maxHeight = isLast ? maxWithBottom : maxNoBottom;
    const pick = pickCounts(maxHeight);
    const flowCount = Math.min(pick.flowCount || 0, flowEnd);
    const frictionCount = Math.min(pick.frictionCount || 0, frictionEnd);

    const flowStart = Math.max(0, flowEnd - flowCount);
    const frictionStart = Math.max(0, frictionEnd - frictionCount);

    pages.push({
      flowStart,
      flowEnd,
      flowCount,
      frictionStart,
      frictionEnd,
      frictionCount,
      isLast,
    });

    flowEnd = flowStart;
    frictionEnd = frictionStart;
    isLast = false;
  }

  return pages.reverse();
}

function buildPrefixSums(list = []) {
  const sums = [0];
  for (const value of list) {
    sums.push(sums[sums.length - 1] + value);
  }
  return sums;
}

function sumTail(sums, endIndex, count) {
  if (!count) return 0;
  const start = Math.max(0, endIndex - count);
  return sums[endIndex] - sums[start];
}

function calcBlockHeight({ headHeight = 0, rowHeights = [], gap = 0, endIndex = rowHeights.length, count = rowHeights.length, sums = null } = {}) {
  const safeCount = Math.max(0, count);
  const totalRows = sums ? sumTail(sums, endIndex, safeCount) : rowHeights.slice(endIndex - safeCount, endIndex).reduce((a, b) => a + b, 0);
  if (!safeCount) return headHeight;
  return headHeight + totalRows + gap * Math.max(0, safeCount - 1);
}

function maxRowsFitFromEnd({ rowHeights = [], headHeight = 0, gap = 0, endIndex = rowHeights.length, maxHeight = 0 }) {
  let total = headHeight;
  let count = 0;
  for (let i = endIndex - 1; i >= 0; i--) {
    const rowHeight = rowHeights[i] || 0;
    const extraGap = count > 0 ? gap : 0;
    if (total + extraGap + rowHeight > maxHeight) break;
    total += extraGap + rowHeight;
    count += 1;
  }
  return Math.max(count, 1);
}

function paginateStackBlocksFromStart({ blockHeights = [], gap = 0, maxHeight = 0 }) {
  const pages = [];
  let start = 0;
  let total = 0;
  for (let i = 0; i < blockHeights.length; i += 1) {
    const h = blockHeights[i] || 0;
    const nextTotal = total ? total + gap + h : h;
    if (nextTotal <= maxHeight || start === i) {
      total = nextTotal;
      continue;
    }
    pages.push({ start, end: i });
    start = i;
    total = h;
  }
  if (blockHeights.length) pages.push({ start, end: blockHeights.length });
  if (!pages.length) pages.push({ start: 0, end: 0 });
  return pages;
}

function paginateSingleListFromEnd({ rowHeights = [], headHeight = 0, gap = 0, maxNoBottom = 0, maxWithBottom = 0 }) {
  const pages = [];
  let end = rowHeights.length;
  let isLast = true;
  while (end > 0) {
    const maxHeight = isLast ? maxWithBottom : maxNoBottom;
    const count = maxRowsFitFromEnd({ rowHeights, headHeight, gap, endIndex: end, maxHeight });
    const start = Math.max(0, end - count);
    pages.push({ start, end, count, isLast });
    end = start;
    isLast = false;
  }
  return pages.reverse();
}

module.exports = {
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
};
