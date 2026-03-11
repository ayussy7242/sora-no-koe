"use strict";

const BACKGROUND_COLORS = {
  bgDeep: "#050816",
  bg: "#0A0F2A",
  accentBlue: "#A9C6FF",
  line: "#2A2D4A",
};

const ELEMENT_PALETTES = {
  fire: {
    nebula: ["#5A1622", "#6B1A26", "#7A231F", "#8A3A22"],
    glow: "#C9876B",
    star: "#F7D8C7",
  },
  earth: {
    nebula: ["#4A3018", "#6A4720", "#8A6428", "#B08A32"],
    glow: "#E0BC6A",
    star: "#FFF1C8",
  },
  air: {
    nebula: ["#2FAE8F", "#3FC7A8", "#5FE1C6", "#6EE7B7"],
    glow: "#7DEED7",
    star: "#E6FFF8",
  },
  water: {
    nebula: ["#1A2F63", "#24457A", "#2F5F86", "#3B7EA0"],
    glow: "#8BB8E8",
    star: "#DCEEFF",
  },
  mixed: {
    nebula: ["#2A3046", "#3A3F58", "#4A4F68", "#5A5F78"],
    glow: "#C7CAE3",
    star: "#E4E8F5",
  },
};

const ELEMENT_MIST_COLORS = {
  fire: ["#4A151E", "#5A1622", "#6B1A26"],
  water: ["#1A2F63", "#24457A", "#2F5F86"],
  air: ["#1A3F3A", "#1F5B53", "#2E7F72"],
  earth: ["#4A3018", "#6A4720", "#8A6428"],
  mixed: ["#2A3046", "#4A4F68"],
};

const ELEMENT_OPACITY_SCALE = {
  fire: 1.0,
  water: 1.0,
  air: 1.0,
  earth: 1.0,
  mixed: 1.0,
};

const ELEMENT_BASE_COLORS = {
  water: ["#050816", "#08122B", "#0C1A3E", "#1A1A46"],
  fire: ["#090308", "#16040A", "#2A0A14", "#3A1620"],
  air: ["#030611", "#081020", "#101A30", "#1D2740"],
  earth: ["#05040A", "#101014", "#1B1618", "#2A221C"],
  mixed: ["#030611", "#050816", "#07122B"],
};

const LONG_THEME_COLORS = {
  fire: ["#18060A", "#22070D", "#2A0A14", "#301018"],
  water: ["#08122B", "#0C1A3E", "#101E46", "#141F52"],
  air: ["#0B140F", "#102017", "#13261B", "#183020"],
  earth: ["#120D08", "#1A120B", "#23180F", "#2C2014"],
  mixed: ["#12131D", "#171826", "#1C1F2B", "#232636"],
};

const DEFAULT_MOON_LAYOUT = {
  x: 96,
  y: 220,
  size: 172,
  starAvoidRadius: 88,
};

module.exports = {
  BACKGROUND_COLORS,
  ELEMENT_PALETTES,
  ELEMENT_MIST_COLORS,
  ELEMENT_OPACITY_SCALE,
  ELEMENT_BASE_COLORS,
  LONG_THEME_COLORS,
  DEFAULT_MOON_LAYOUT,
};
