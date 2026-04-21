// eslint.config.js
/**
 * ESLint flat config for CampusAlert.
 *
 * ESLint v9 uses a flat array of config objects instead of the old
 * .eslintrc format. Each object applies to the files matched by `files`.
 *
 * Plugins used:
 *  - @typescript-eslint  → TypeScript-aware linting rules
 *  - react-hooks         → enforces Rules of Hooks (v5 supports ESLint v9)
 */

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  // ── Ignore patterns ───────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "build/**",
      "*.config.js", // Don't lint babel/metro configs with TS rules
    ],
  },

  // ── TypeScript source files ───────────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      // React Hooks rules — catches missing deps, conditional hook calls, etc.
      ...reactHooksPlugin.configs.recommended.rules,

      // Relax a few rules that are noisy during development
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
