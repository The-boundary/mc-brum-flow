/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: ["**/dist/**", "**/node_modules/**"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: ["eslint:recommended", "plugin:react-hooks/recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  rules: {
    "no-undef": "off",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  },
  overrides: [
    { files: ["client/**/*.{ts,tsx}"], env: { browser: true, es2022: true } },
    { files: ["server/**/*.ts"], env: { node: true, es2022: true }, globals: { crypto: "readonly" } },
  ],
};
