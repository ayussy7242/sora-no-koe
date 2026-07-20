"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("createCheckoutUrlForLine500 attaches line_user_id to checkout and subscription metadata", async () => {
  const stripeModulePath = require.resolve("stripe");
  const paymentModulePath = require.resolve("../src/integrations/line/payment");
  const env = require("../src/config/env");

  const originalStripeModule = require.cache[stripeModulePath];
  const originalPaymentModule = require.cache[paymentModulePath];

  const originalSecret = env.STRIPE_SECRET_KEY;
  const originalPriceId = env.STRIPE_PRICE_ID_LINE_500;
  const originalSuccessUrl = env.STRIPE_SUCCESS_URL;
  const originalCancelUrl = env.STRIPE_CANCEL_URL;

  let capturedArgs = null;

  try {
    require.cache[stripeModulePath] = {
      id: stripeModulePath,
      filename: stripeModulePath,
      loaded: true,
      exports: class FakeStripe {
        constructor() {
          this.checkout = {
            sessions: {
              create: async (args) => {
                capturedArgs = args;
                return { url: "https://checkout.example.test/session" };
              },
            },
          };
          this.billingPortal = {
            sessions: {
              create: async () => ({ url: "https://checkout.example.test/portal" }),
            },
          };
        }
      },
    };
    delete require.cache[paymentModulePath];

    env.STRIPE_SECRET_KEY = "sk_test_line_plus";
    env.STRIPE_PRICE_ID_LINE_500 = "price_test_line_500";
    env.STRIPE_SUCCESS_URL = "https://example.test/success";
    env.STRIPE_CANCEL_URL = "https://example.test/cancel";

    const { createCheckoutUrlForLine500 } = require("../src/integrations/line/payment");
    const result = await createCheckoutUrlForLine500({ lineUserId: "U_LINE_123" });

    assert.equal(result.ok, true);
    assert.equal(result.url, "https://checkout.example.test/session");
    assert.ok(capturedArgs);
    assert.equal(capturedArgs.mode, "subscription");
    assert.equal(capturedArgs.metadata.line_user_id, "U_LINE_123");
    assert.equal(capturedArgs.subscription_data.metadata.line_user_id, "U_LINE_123");
    assert.equal(capturedArgs.subscription_data.metadata.plan, "line_500");
  } finally {
    env.STRIPE_SECRET_KEY = originalSecret;
    env.STRIPE_PRICE_ID_LINE_500 = originalPriceId;
    env.STRIPE_SUCCESS_URL = originalSuccessUrl;
    env.STRIPE_CANCEL_URL = originalCancelUrl;

    if (originalStripeModule) require.cache[stripeModulePath] = originalStripeModule;
    else delete require.cache[stripeModulePath];

    if (originalPaymentModule) require.cache[paymentModulePath] = originalPaymentModule;
    else delete require.cache[paymentModulePath];
  }
});

test("PLUS_MENU returns invite text with dynamic checkout URL when plus is enabled", async () => {
  const paymentModulePath = require.resolve("../src/integrations/line/payment");
  const pipelineModulePath = require.resolve("../src/integrations/line/pipeline");
  const env = require("../src/config/env");

  const paymentModule = require(paymentModulePath);
  const originalCreateCheckout = paymentModule.createCheckoutUrlForLine500;
  const originalGetPaidStatus = paymentModule.getPaidStatus;
  const originalPlusEnabled = env.PLUS_ENABLED;

  try {
    paymentModule.createCheckoutUrlForLine500 = async ({ lineUserId }) => ({
      ok: true,
      url: `https://checkout.example.test/${lineUserId}`,
    });
    paymentModule.getPaidStatus = async () => ({ paid: false });
    env.PLUS_ENABLED = true;

    delete require.cache[pipelineModulePath];
    const { processCommand } = require("../src/integrations/line/pipeline");

    const result = await processCommand({
      rawText: "ソラのこえ＋",
      cmd: "ソラのこえ＋",
      appUserId: "app_1",
      lineUserId: "U_LINE_456",
      modules: {
        natal: {
          handleCollect: async () => null,
          hasNatal: async () => true,
          isNatalReady: async () => true,
        },
        story: {
          handleUtilities: async () => null,
          renderFallback: () => "fallback",
        },
        relation: {},
        user: {
          getLineUserDeepMode: async () => false,
        },
      },
      renderers: {},
      db: {},
      admin: {},
      storage: null,
    });

    assert.equal(result.stage, "plus_join");
    assert.match(result.text, /ソラのこえ＋/);
    assert.match(result.text, /https:\/\/checkout\.example\.test\/U_LINE_456/);
  } finally {
    paymentModule.createCheckoutUrlForLine500 = originalCreateCheckout;
    paymentModule.getPaidStatus = originalGetPaidStatus;
    env.PLUS_ENABLED = originalPlusEnabled;
    delete require.cache[pipelineModulePath];
  }
});
