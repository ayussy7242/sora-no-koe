"use strict";

const fs = require("fs");
const path = require("path");

const dotenv = require("dotenv");

const configEnvPath = path.resolve(__dirname, "..", "config", ".env");
const rootEnvPath = path.resolve(__dirname, "..", ".env");

if (fs.existsSync(configEnvPath)) {
  dotenv.config({ path: configEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
