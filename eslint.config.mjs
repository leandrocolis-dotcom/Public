import js from "@eslint/js";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ["assets/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.browser, Chart: "readonly" } },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker, AbortController: "readonly" },
    },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "api/**/*.js", "*.mjs", "*.config.*"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
  },
  {
    ignores: [
      "node_modules/**",
      "vendor/**",
      "fonts/**",
      "coverage/**",
      "dist/**",
      ".claude/**",
      "supabase/functions/quotes-feed/quotes.bundle.js",
      "supabase/functions/push/push.bundle.js",
    ],
  },
];
