"use strict";

const daily = {
  slide1: require("./daily/slide_1"),
  slide2: require("./daily/slide_2"),
  slide3: require("./daily/slide_3"),
  slide4: require("./daily/slide_4"),
  slide5: require("./daily/slide_5"),
  slideMoon: require("./daily/slide_moon"),
  placements: require("./daily/slide_placements"),
};

const moonEvent = {
  slide1: require("./moon_event/slide_1"),
  slide2: require("./moon_event/slide_2"),
  slide3: require("./moon_event/slide_3"),
  slide4: require("./moon_event/slide_4"),
  slide5: require("./moon_event/slide_5"),
  slideMoon: require("./moon_event/slide_moon"),
  placements: require("./moon_event/slide_placements"),
};

module.exports = {
  daily,
  moon_event: moonEvent,
};
