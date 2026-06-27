// Vite resolves plain-CSS side-effect imports — `import "./styles.css"` and the
// bundled `@fontsource/*.css` — at build time. TypeScript 6 requires a type
// declaration for side-effect imports of non-code modules (it silently allowed
// them through 5.x), so declare the `*.css` module shape here.
declare module "*.css";
