// babel.config.js
/**
 * Babel configuration for CampusAlert.
 *
 * Key plugins:
 *  - react-native-reanimated/plugin  → must be LAST (Reanimated requirement)
 *  - module-resolver                 → maps @core/*, @features/*, etc. to src/
 *  - react-compiler (experimental)   → enabled via app.json experiments
 *
 * NOTE: expo-router/babel is intentionally ABSENT — we use React Navigation,
 *       not file-based routing.
 */
module.exports = function (api) {
  // Cache the config for faster rebuilds.
  api.cache(true);

  return {
    presets: [
      // 'babel-preset-expo' handles JSX, TypeScript, and Hermes transforms.
      "babel-preset-expo",
    ],
    plugins: [
      // ── Path aliases ──────────────────────────────────────────────────────
      // Maps the shorthand imports (e.g. @core/api/apiClient) to
      // the actual file paths under src/.
      // Must match the paths defined in tsconfig.json.
      [
        "module-resolver",
        {
          root: ["./src"],
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
          alias: {
            "@core": "./src/core",
            "@models": "./src/models",
            "@services": "./src/services",
            "@store": "./src/store",
            "@features": "./src/features",
            "@navigation": "./src/navigation",
            "@hooks": "./src/hooks",
            "@utils": "./src/utils",
          },
        },
      ],

      // ── Reanimated ────────────────────────────────────────────────────────
      // MUST be the last plugin. Reanimated uses a Babel transform to move
      // worklet functions off the JS thread onto the UI thread.
      "react-native-reanimated/plugin",
    ],
  };
};
