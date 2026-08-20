import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { productPricingCopy } from "./i18n/productPricingCopy";

const source = readFileSync(resolve(process.cwd(), "components/ProductPricingModal.tsx"), "utf8");

assert.match(source, /script\.src = "https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js"/);
assert.match(source, /script\.onerror = \(\) => \{[\s\S]*?razorpayScriptPromise = null;[\s\S]*?resolve\(false\);/);
assert.match(source, /await verifyRazorpayOrder\([\s\S]*?await refresh\(\);/);
assert.match(source, /copy\("notice\.gatewaySetupRequired"\)/);
assert.match(productPricingCopy("en", "notice.gatewaySetupRequired"), /No plan or units were granted/);
console.log("Razorpay Checkout retry and verification contract: PASS");
