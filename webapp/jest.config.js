const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/?(*.)+(test).[tj]s?(x)"],
  transform: {
    ...tsJestTransformCfg,
  },
};
