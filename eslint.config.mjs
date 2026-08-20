import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-qa/**",
    ".next-*/**",
    "backend/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone local browser/API diagnostics are executed directly and are
    // not shipped in the Next.js application bundle.
    "test-*.js",
  ]),
]);

export default eslintConfig;
