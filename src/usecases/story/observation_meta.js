"use strict";

const { buildMoonStatus, findNextMoonSignChangeDetailed } = require("../../domain/moon");
const { toDateTimeLocalJST } = require("../../utils/time");

function buildObservationMeta({ story, dict, asOfISO, dateLocal, timeZone = "Asia/Tokyo" } = {}) {
  const storyAsOf = String(story?.meta?.as_of || asOfISO || "").trim();
  if (!storyAsOf) return null;

  const status = buildMoonStatus({ asOfISO: storyAsOf, story, dict });
  const nextMove = findNextMoonSignChangeDetailed({ asOfISO: storyAsOf, dict });

  return {
    dateLocal: String(story?.meta?.date_local || dateLocal || "").trim() || null,
    timezone: timeZone,
    asOfISO: storyAsOf,
    asOfLocal: toDateTimeLocalJST(new Date(storyAsOf)),
    moonAgeDays: Number.isFinite(Number(status?.moonAge)) ? Number(status.moonAge) : null,
    moonSign: String(status?.signJa || "").trim() || null,
    nextMoonSignChange: nextMove?.date && nextMove?.to?.label
      ? {
          atISO: nextMove.date.toISOString(),
          toSign: nextMove.to.label,
          hoursAhead: Number.isFinite(Number(nextMove.hoursAhead)) ? Number(nextMove.hoursAhead) : null,
        }
      : null,
  };
}

module.exports = { buildObservationMeta };
