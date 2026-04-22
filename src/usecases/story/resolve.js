"use strict";

const { normalizeStoryArgs } = require("./args");
const { buildPublicStorySnapshot } = require("./store");

function shouldUsePublicStorySnapshot({ appUserId, mode } = {}) {
  return appUserId === "public" && String(mode || "").toLowerCase() === "public";
}

async function resolveStory({
  storyService,
  appUserId,
  mode,
  dateLocal,
  asOfISO,
  orbMaxDeg,
  precisionDeg,
  savePublic = false,
} = {}) {
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");

  if (shouldUsePublicStorySnapshot({ appUserId, mode })) {
    return (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: savePublic })).story;
  }

  return storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId,
      mode,
      dateLocal,
      asOfISO,
      orbMaxDeg,
      precisionDeg,
    })
  );
}

async function resolvePublicStory({ storyService, dateLocal, asOfISO, save = false } = {}) {
  return resolveStory({
    storyService,
    appUserId: "public",
    mode: "public",
    dateLocal,
    asOfISO,
    savePublic: save,
  });
}

module.exports = {
  shouldUsePublicStorySnapshot,
  resolveStory,
  resolvePublicStory,
};
