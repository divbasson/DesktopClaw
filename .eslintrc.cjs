module.exports = {
  root: true,
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "build/",
    "models/",
    "desktopclaw-debug.log",
    "openclaw-control-index.js",
  ],
  env: {
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "no-undef": "error",
    "no-unused-vars": "off",
    "no-console": "off",
  },
  overrides: [
    {
      files: ["src/renderer/**/*.js"],
      env: {
        browser: true,
      },
      parserOptions: {
        sourceType: "module",
      },
    },
    {
      files: [
        "src/main/**/*.js",
        "src/shared/**/*.js",
        "scripts/**/*.js",
      ],
      env: {
        node: true,
        commonjs: true,
      },
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
};
