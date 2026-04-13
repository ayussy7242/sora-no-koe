"use strict";

const { generateIgObservationText } = require("./observation");
const { generateIgResonanceText } = require("./resonance");
const { generateIgTsukijiStructureText } = require("./tsukiji_structure");
const { generateIgSkyOverviewText } = require("./sky_overview");
const { generateIgMoonText } = require("./moon");
const { generateIgHashtags } = require("./hashtags");
const {
  generateIgCarouselCaptionText,
  generateIgCarouselObservationText,
} = require("./carousel_caption");
const { ensureIgOutputs } = require("../../../story/output_helpers");

async function generateIgDailyAiOutputs({
  story,
  dict,
  openai,
  asOfISO,
  useAi = true,
  forceAi = false,
  variant,
  slot,
} = {}) {
  if (!useAi) return story;
  const apiKey = String(openai?.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return story;

  const igOut = ensureIgOutputs(story);
  const openaiClient = {
    apiKey,
    baseUrl: openai?.baseUrl,
    model: openai?.model,
    maxRetries: openai?.maxRetries,
  };

  if (forceAi || !igOut.parts.observation) {
    const obs = await generateIgObservationText({ story, dict, openai: openaiClient });
    if (obs?.ok && obs.text) {
      igOut.parts.observation = obs.text;
      igOut.rendered.carousel.slide1_observation = obs.text;
    }
  }

  if (forceAi || !igOut.parts.moon) {
    const moon = await generateIgMoonText({ story, dict, openai: openaiClient, asOfISO, variant });
    if (moon?.ok && moon.text) {
      igOut.parts.moon = moon.text;
      igOut.rendered.carousel.slide2_text = moon.text;
    }
  }

  const slotKey = String(slot || "").toLowerCase();
  if (slotKey === "night") {
    if (forceAi || !igOut.parts.moon_caption) {
      const moonCaption = await generateIgMoonText({
        story,
        dict,
        openai: openaiClient,
        asOfISO,
        variant: "night_caption",
        maxRetries: 2,
      });
      if (moonCaption?.ok && moonCaption.text) {
        igOut.parts.moon_caption = moonCaption.text;
      }
    }
  }

  const currentResonanceKey = igOut.source?.resonance_aspect_key || "";
  const usedResonanceKey = igOut.source?.resonance_aspect_key_used || "";
  const needsResonance =
    forceAi ||
    !igOut.parts.resonance ||
    !usedResonanceKey ||
    (currentResonanceKey && currentResonanceKey !== usedResonanceKey);

  if (needsResonance) {
    const res = await generateIgResonanceText({ story, dict, openai: openaiClient, variant });
    if (res?.ok && res.text) {
      igOut.parts.resonance = res.text;
      igOut.rendered.carousel.slide3_text = res.text;
      igOut.source.resonance_aspect_key_used = currentResonanceKey || "";
      igOut.source.resonance_aspect_used = igOut.source?.resonance_aspect || null;
    }
  }

  if (String(slot || "").toLowerCase() === "resonance") {
    const needsCaption = forceAi || !igOut.parts.resonance_caption;
    if (needsCaption) {
      const resCaption = await generateIgResonanceText({
        story,
        dict,
        openai: openaiClient,
        variant: "caption",
      });
      if (resCaption?.ok && resCaption.text) {
        igOut.parts.resonance_caption = resCaption.text;
      }
    }
  }

  if (forceAi || !igOut.parts.tsukiji_structure) {
    const ts = await generateIgTsukijiStructureText({ story, dict, openai: openaiClient });
    if (ts?.ok && ts.text) {
      igOut.parts.tsukiji_structure = ts.text;
      igOut.rendered.carousel.slide4_structure = ts.text;
    }
  }

  if (forceAi || !igOut.parts.sky_overview) {
    const sky = await generateIgSkyOverviewText({ story, dict, openai: openaiClient });
    if (sky?.ok && sky.text) {
      igOut.parts.sky_overview = sky.text;
      igOut.sky_overview_text = sky.text;
    }
  }

  if (forceAi || !igOut.parts.caption_center) {
    const cap = await generateIgCarouselCaptionText({ story, dict, openai: openaiClient, asOfISO });
    if (cap?.ok && cap.text) {
      igOut.parts.caption_center = cap.text;
    }
  }

  if (forceAi || !igOut.parts.caption_observation) {
    const obs = await generateIgCarouselObservationText({ story, dict, openai: openaiClient });
    if (obs?.ok && obs.text) {
      igOut.parts.caption_observation = obs.text;
    }
  }

  if (slot) {
    const slotKey = String(slot || "").toLowerCase();
    const hashtagsKey = slotKey ? `hashtags_${slotKey}` : "hashtags";
    const needsHashtags = forceAi || !igOut.parts?.[hashtagsKey];
    if (needsHashtags) {
      const tags = await generateIgHashtags({ story, dict, openai: openaiClient, slot: slotKey });
      if (tags?.ok && tags.text) {
        igOut.parts[hashtagsKey] = tags.text;
      }
    }
  }

  return story;
}

module.exports = { generateIgDailyAiOutputs };
