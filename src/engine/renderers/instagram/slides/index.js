"use strict";

const moonEvent = {
  slide1: require("./moon_event/slide_1"),
  slide2: require("./moon_event/slide_2"),
  slide3: require("./moon_event/slide_3"),
  slide4: require("./moon_event/slide_4"),
  slide5: require("./moon_event/slide_5"),
  slideMoon: require("./moon_event/slide_moon"),
  placements: require("./moon_event/slide_placements"),
};

const monthlyOverview = {
  slide1: require("./monthly_overview/slide_1"),
  slide2: require("./monthly_overview/slide_2"),
};

const morning = {
  slide1: require("./morning/slide_1"),
  slide2: require("./morning/slide_2"),
  slide3: require("./morning/slide_3"),
  slide4: require("./morning/slide_4"),
};

const resonance = {
  slide1: require("./resonance/slide_1"),
  slide2: require("./resonance/slide_2"),
};

const moon = {
  slide1: require("./moon/slide_1"),
  slide2: require("./moon/slide_2"),
};

module.exports = {
  moon_event: moonEvent,
  monthly_overview: monthlyOverview,
  morning,
  resonance,
  moon,
};
