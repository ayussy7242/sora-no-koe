"use strict";

const { formatElementModalityLines } = require("../../../render_parts/format/line_common");

function formatElements({ skyStrata }) {
  const lines = formatElementModalityLines(skyStrata);
  if (!lines.length) return ["該当なし"];
  return ["🔥 元素／三区分（T）", "【惑星属性】", lines[0], "【三区分】", lines[1]];
}

module.exports = { formatElements };
