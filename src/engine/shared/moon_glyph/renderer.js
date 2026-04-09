"use strict";

function renderMoonGlyph({ x = 0, y = 0, defs = [], body = [] } = {}) {
  const defsBlock = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  const bodyBlock = body.join("");
  return [
    `<g transform="translate(${x} ${y})">`,
    defsBlock,
    bodyBlock,
    `</g>`,
  ].join("");
}

module.exports = {
  renderMoonGlyph,
};
