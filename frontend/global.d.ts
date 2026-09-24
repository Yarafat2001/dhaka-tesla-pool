// Next.js compiles CSS imports away at build time, so TypeScript has no module
// to resolve them against. Without these declarations, newer TypeScript versions
// fail type-checking on side-effect imports like `import './globals.css'` in
// app/layout.tsx with:
//   TS2882: Cannot find module or type declarations for side-effect import.
declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
