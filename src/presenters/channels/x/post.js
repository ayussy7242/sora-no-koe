"use strict";

/**
 * channels/x.js
 * - Xは「きょうのそら」だけ（配置一覧 + 分布）
 * - 余計な個人要素は出さない
 */

const { renderSoraLine } = require("../line/sora");

function renderX(story, deps = {}) {
  return renderSoraLine(story, {
    ...deps,
    includeHeader: true,
    includeAspect: false,
    paid: false,
  });
}

module.exports = { renderX };
