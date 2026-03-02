"use strict";

/**
 * channels/ig.js
 * - IGも「きょうのそら」だけ（配置一覧 + 分布）
 * - 文章/解釈/個人要素は出さない
 */

const { renderSoraLine } = require("./line_sora");

function renderIG(story, deps = {}) {
  return renderSoraLine(story, {
    ...deps,
    includeHeader: true,
    includeAspect: false,
    paid: false,
  });
}

module.exports = { renderIG };
