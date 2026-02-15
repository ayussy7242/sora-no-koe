"use strict";

const { CloudTasksClient } = require("@google-cloud/tasks");

function createTasksClient() {
  return new CloudTasksClient();
}

function requireTasksEnv(env) {
  const project = env?.CLOUD_TASKS_PROJECT || null;
  const location = env?.CLOUD_TASKS_LOCATION || null;
  const queue = env?.CLOUD_TASKS_QUEUE || null;
  const url = env?.BLUEPRINT_WORKER_URL || env?.BLUEPRINT_GENERATE_URL || null;
  const saEmail = env?.TASKS_CALLER_SA_EMAIL || null;
  const token = env?.INTERNAL_TASKS_TOKEN || null;

  if (!project || !location || !queue || !url || !saEmail) {
    throw new Error("tasks env missing");
  }
  return { project, location, queue, url, saEmail, token };
}

async function enqueueBlueprintGenerate({ env, lineUserId, blueprintType = "light" }) {
  if (!lineUserId) throw new Error("lineUserId is required");
  const { project, location, queue, url, saEmail, token } = requireTasksEnv(env);

  const client = createTasksClient();
  const parent = client.queuePath(project, location, queue);

  const payload = {
    line_user_id: lineUserId,
    blueprint_type: blueprintType,
  };

  const headers = { "Content-Type": "application/json" };
  if (token) headers["x-internal-tasks-token"] = token;

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url,
      headers,
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: { serviceAccountEmail: saEmail },
    },
  };

  const [response] = await client.createTask({ parent, task });
  return response;
}

module.exports = { enqueueBlueprintGenerate };
