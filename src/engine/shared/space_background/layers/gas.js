"use strict";

const core = require("./gas_core");
const legacy = require("./gas_legacy");

module.exports = {
  ...core,
  ...legacy,
};
