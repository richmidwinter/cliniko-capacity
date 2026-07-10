import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["electron"], // provided by the runtime
  sourcemap: true,
  logLevel: "info",
};

await build({ ...common, entryPoints: ["src/main.ts"], outfile: "build/main.js" });
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "build/preload.js" });
console.log("✓ built main + preload → build/");
