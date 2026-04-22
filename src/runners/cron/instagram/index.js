"use strict";

const { runIgMonthlyPost } = require("./monthly");
const { runIgMonthlyOverviewReel } = require("./monthly_overview_reel");
const {
  runIgPost,
  runIgMorningPost,
  runIgResonancePost,
  runIgNightPost,
} = require("./post");
const { runIgMoonEventPost } = require("./moon_event_post");

module.exports = {
  runIgPost,
  runIgMorningPost,
  runIgResonancePost,
  runIgNightPost,
  runIgMoonEventPost,
  runIgMonthlyPost,
  runIgMonthlyOverviewReel,
};
