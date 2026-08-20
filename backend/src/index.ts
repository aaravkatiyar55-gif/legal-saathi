import { env } from "./config/env";
import { createApp } from "./app";
import { isRazorpayConfigured } from "./services/payments/razorpay.service";
import { isAdminSecurityConfigured } from "./middleware/adminAccess.middleware";
import { assertEnvironmentReady, EnvironmentValidationError } from "./config/validateEnvironment";
import { ensureOpenRouterModelCatalog } from "./services/ai/openRouterCatalog.service";

async function start() {
  let environmentStatus;
  try {
    environmentStatus = assertEnvironmentReady();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      console.error(`[Security] Production startup blocked. Missing or invalid controls: ${error.names.join(", ")}`);
    } else {
      console.error("[Security] Production startup blocked by environment validation.");
    }
    process.exitCode = 1;
    return;
  }

  if (env.aiProvider === "openrouter" && env.openRouterApiKeys.length > 0) {
    const catalog = await ensureOpenRouterModelCatalog();
    console.log(`[OpenRouter] zero-cost catalog ready: ${catalog.ready}; verified free models: ${catalog.zeroCostModelCount}`);
  }

  const app = createApp();
  const port = Number(process.env.PORT || env.port || 8000);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Legal Saathi backend listening on port ${port}`);
    console.log(`Mock mode: ${env.mockMode ? "on" : "off"}`);
    const keyIdConfigured = Boolean(env.razorpayKeyId?.trim()) && !env.razorpayKeyId.includes("PASTE_");
    const keySecretConfigured = Boolean(env.razorpayKeySecret?.trim()) && !env.razorpayKeySecret.includes("PASTE_");
    console.log(`[Razorpay] keyId configured: ${keyIdConfigured}`);
    console.log(`[Razorpay] keySecret configured: ${keySecretConfigured}`);
    console.log(`[Razorpay] mode: ${env.razorpayMode}`);
    console.log(`[Razorpay] currency: ${env.razorpayCurrency || "INR"}`);
    console.log(`[Razorpay] ready: ${isRazorpayConfigured()}`);
    console.log(`[Security] Google identity configured: ${Boolean(env.googleClientId.trim())}`);
    console.log(`[Security] Admin session configured: ${isAdminSecurityConfigured()}`);
    console.log(`[Security] Insecure development auth: ${env.nodeEnv !== "production" && env.allowInsecureDevAuth}`);
    if (environmentStatus.warnings.length > 0) {
      console.warn(`[Security] Optional features unavailable: ${environmentStatus.warnings.join(", ")}`);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`[Runtime] ${signal} received; stopping new requests.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

void start();
