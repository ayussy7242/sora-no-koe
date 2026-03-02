"use strict";

const { PAGE_PAD_X, PAGE_PAD_TOP, PAGE_PAD_BOTTOM, SAFE_FOOTER } = require("../../layout");

const LAYOUT = Object.freeze({
  name: "a4",
  pageSize: "A4",
  padX: PAGE_PAD_X,
  padTop: PAGE_PAD_TOP,
  padBottom: PAGE_PAD_BOTTOM,
  safeFooter: SAFE_FOOTER,
  suppressFooter: false,
});

module.exports = {
  LAYOUT,
};
