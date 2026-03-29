"use strict";

/**
 * channels/ig/post.js
 * - IG: 観測ログ用の固定キャプション
 */

const { renderIGCaption } = require("../format/ig_caption");

function renderIG(story, deps = {}) {
  return renderIGCaption(story, deps);
}

module.exports = { renderIG };
