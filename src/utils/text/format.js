"use strict";

function joinLines(lines = [], opts = {}) {
  const trim = opts.trim === true;
  const collapseBlank = opts.collapseBlank === true;
  const filterNull = opts.filterNull !== false;
  const source = filterNull ? lines.filter((v) => v !== undefined && v !== null) : lines;
  const joined = source.join("\n");
  const collapsed = collapseBlank ? joined.replace(/\n{3,}/g, "\n\n") : joined;
  return trim ? collapsed.trim() : collapsed;
}

module.exports = { joinLines };
