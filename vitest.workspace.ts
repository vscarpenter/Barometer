// Each package is a vitest project. The web package (added later) overrides the
// environment to jsdom; types/engine use the default node environment.
export default ["packages/types", "packages/engine"];
