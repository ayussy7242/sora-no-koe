"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./fs");

function writeTextFile({ outDir, filename, content, encoding = "utf8" } = {}) {
  if (!outDir) return null;
  ensureDir(outDir);
  const full = path.join(outDir, filename);
  fs.writeFileSync(full, String(content ?? ""), encoding);
  return full;
}

function writeJsonFile({ outDir, filename, data, space = 2 } = {}) {
  if (!outDir) return null;
  ensureDir(outDir);
  const full = path.join(outDir, filename);
  fs.writeFileSync(full, JSON.stringify(data, null, space), "utf8");
  return full;
}

function writeBufferFile({ outDir, filename, buffer } = {}) {
  if (!outDir) return null;
  ensureDir(outDir);
  const full = path.join(outDir, filename);
  fs.writeFileSync(full, buffer);
  return full;
}

function writeTextFiles({ outDir, items = [], encoding = "utf8" } = {}) {
  if (!outDir) return { paths: [], byKey: {} };
  ensureDir(outDir);
  const paths = [];
  const byKey = {};
  items.forEach((item, idx) => {
    if (!item) return;
    const filename = item.filename || `item_${idx + 1}.txt`;
    const full = path.join(outDir, filename);
    fs.writeFileSync(full, String(item.content ?? ""), encoding);
    paths.push(full);
    if (item.key) byKey[item.key] = full;
  });
  return { paths, byKey };
}

function writeBufferFiles({ outDir, items = [] } = {}) {
  if (!outDir) return { paths: [], byKey: {} };
  ensureDir(outDir);
  const paths = [];
  const byKey = {};
  items.forEach((item, idx) => {
    if (!item) return;
    const filename = item.filename || `item_${idx + 1}.bin`;
    const full = path.join(outDir, filename);
    fs.writeFileSync(full, item.buffer);
    paths.push(full);
    if (item.key) byKey[item.key] = full;
  });
  return { paths, byKey };
}

module.exports = {
  writeTextFile,
  writeJsonFile,
  writeBufferFile,
  writeTextFiles,
  writeBufferFiles,
};
