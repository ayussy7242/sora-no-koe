"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir } = require("../../../utils/infra/fs");

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

module.exports = {
  writeTextFile,
  writeJsonFile,
  writeBufferFile,
};
