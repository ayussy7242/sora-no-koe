"use strict";

function resolveEnv(env) {
  return { ...(env || {}), ...(process.env || {}) };
}

module.exports = {
  resolveEnv,
};
