"use strict";

/**
 * format.js — output formatting utilities (v3.3.6+)
 * - “整形だけ” に徹する（判定/解釈は render.js / channels 側）
 * - 余韻（yoin）は撤去済み（空層へ一本化）
 *
 * NOTE:
 * - 実装は用途別に分割し、このファイルは集約のみ
 */

const sky = require("./format/sky");
const personal = require("./format/personal");
const blocks = require("./format/blocks");
const x = require("./format/x");

module.exports = {
  ...sky,
  ...personal,
  ...x,
  ...blocks,
};
