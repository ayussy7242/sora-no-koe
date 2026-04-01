"use strict";

const fs = require("fs");

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  ensureDir,
};
