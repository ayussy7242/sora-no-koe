"use strict";

const { enqueueBlueprintGenerate, enqueueBlueprintPdfGenerate } = require("../../../../integrations/cloudtasks/tasks_queue");

async function enqueueBlueprintJob({ env, lineUserId, forceRegen } = {}) {
  return enqueueBlueprintGenerate({ env, lineUserId, blueprintType: "light", forceRegen });
}

async function enqueueBlueprintPdfJob({ env, lineUserId, forceRegen, extraPayload } = {}) {
  return enqueueBlueprintPdfGenerate({
    env,
    lineUserId,
    blueprintType: "light",
    forceRegen,
    extraPayload,
  });
}

module.exports = {
  enqueueBlueprintJob,
  enqueueBlueprintPdfJob,
};
