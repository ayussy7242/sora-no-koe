"use strict";

const { Storage } = require("@google-cloud/storage");
const { GoogleAuth, Impersonated } = require("google-auth-library");
const { resolveEnv } = require("../env");

const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

function resolveProjectId(env = {}) {
  return (
    env.GOOGLE_CLOUD_PROJECT ||
    env.GCLOUD_PROJECT ||
    env.GCP_PROJECT_ID ||
    env.PROJECT ||
    null
  );
}

function resolveImpersonate(env = {}) {
  return env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT || null;
}

async function createImpersonatedStorage({ targetPrincipal, projectId, scopes = DEFAULT_SCOPES } = {}) {
  if (!targetPrincipal) throw new Error("targetPrincipal missing");
  const baseAuth = new GoogleAuth({ scopes, projectId });
  const sourceClient = await baseAuth.getClient();
  const impersonatedClient = new Impersonated({
    sourceClient,
    targetPrincipal,
    targetScopes: scopes,
  });
  const authClient = new GoogleAuth({
    authClient: impersonatedClient,
    scopes,
    projectId,
  });
  return new Storage({ authClient, projectId });
}

async function createStorageClient({ storage, env, impersonate, projectId, scopes = DEFAULT_SCOPES } = {}) {
  const env2 = resolveEnv(env);
  const target = impersonate || resolveImpersonate(env2);
  const project = projectId || resolveProjectId(env2);
  if (target) return createImpersonatedStorage({ targetPrincipal: target, projectId: project, scopes });
  if (storage) return storage;
  return project ? new Storage({ projectId: project }) : new Storage();
}

module.exports = {
  createStorageClient,
  createImpersonatedStorage,
  resolveProjectId,
  resolveImpersonate,
};
