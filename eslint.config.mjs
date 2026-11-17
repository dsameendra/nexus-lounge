import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// typescript-eslint parses with its own TypeScript peer (6.x, installed by pnpm), not the packages' TypeScript 7.

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/.next/",
    "**/dist/",
    "**/next-env.d.ts",
    "e2e/.out/",
    "**/.tmp-*/",
    ".claude/",
    "**/* 2.*",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Best-effort calls (storage, fullscreen, media APIs) deliberately swallow errors with `catch {}`.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Regexes match BOMs and invisible characters on purpose.
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      // `_name` drops a key from a rest spread.
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Full reloads after deleting the account or losing the admin session are intended, to drop client state.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      // React Compiler rules (v7): the app does not use the compiler, and these flag established patterns
      // (refs read in render for latest values, setState in sync effects, useRef(Date.now()) as a mount time).
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["e2e/**/*.mjs"],
    // page.evaluate callbacks run in the browser.
    languageOptions: { globals: { ...globals.browser } },
  },
]);
