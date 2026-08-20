import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatProductPricingCopy,
  productPricingCopy,
  productPricingCopyKeys,
  productPricingLocale,
  type ProductPricingCopyKey,
} from "./productPricingCopy";
import { appLanguages } from "./types";

for (const language of appLanguages) {
  for (const key of productPricingCopyKeys) {
    assert.ok(productPricingCopy(language, key as ProductPricingCopyKey).trim(), `${language} must provide ${key}`);
  }
}

for (const key of ["title.plans", "label.billingCycle", "action.apply", "topup.title", "footer.backendVerification"] as const) {
  assert.notEqual(productPricingCopy("hi", key), productPricingCopy("en", key), `Hindi must localize ${key}`);
  assert.notEqual(productPricingCopy("hinglish", key), productPricingCopy("en", key), `Hinglish must localize ${key}`);
}

assert.equal(formatProductPricingCopy("hi", "price.fromPerCase", { price: "₹500" }), "₹500 से / केस");
assert.equal(formatProductPricingCopy("hinglish", "button.choosePlan", { plan: "Pro" }), "Pro choose karein");
assert.equal(productPricingCopy("en", "title.plans"), "Legal Saathi plans");
assert.equal(productPricingCopy("hinglish", "title.plans"), "Legal Saathi ke plans");
assert.equal(productPricingLocale("hi"), "hi-IN");
assert.equal(productPricingLocale("hinglish"), "en-IN");

const source = readFileSync(new URL("../../components/ProductPricingModal.tsx", import.meta.url), "utf8");
assert.match(source, /language:\s*AppLanguage/);
assert.match(source, /productPricingCopy/);
assert.match(source, /aria-live="polite"/);
assert.match(source, /closeButtonRef/);
assert.match(source, /getModalFocusCycleTarget/, "the pricing dialog must use the shared focus-cycle policy");
assert.match(source, /onKeyDown=\{handleDialogKeyDown\}/, "the pricing dialog must intercept keyboard focus at its boundary");
assert.match(source, /event\.key !== "Tab"/, "the pricing dialog must handle Tab navigation");
assert.doesNotMatch(source, />Legal Saathi plans<|>Monthly<|>Choose a credit pack<|>No frontend click grants access/);

console.info(`Product pricing localization/accessibility contract: PASS ${productPricingCopyKeys.length * appLanguages.length + 18}/${productPricingCopyKeys.length * appLanguages.length + 18}`);
