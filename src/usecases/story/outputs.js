"use strict";

const { buildRenderMap, resolvePrimaryKey, attachOutputs } = require("./render");

async function buildStoryOutputs({ renderers, story, natalCache, format, channel, includeOutputs }) {
  const renderMap = buildRenderMap({ renderers, story, natalCache });
  const primaryKey = resolvePrimaryKey({ format, channel });
  const primaryText = await (renderMap[primaryKey] || renderMap.line)();

  await attachOutputs({
    story,
    renderMap,
    primaryKey,
    primaryText,
    includeOutputs,
  });

  return { primaryKey, primaryText };
}

module.exports = {
  buildStoryOutputs,
};
