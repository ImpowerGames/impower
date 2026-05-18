// Smoke test for the Preact SSR walker. Run from impower-dev:
//   node --disable-warning=ExperimentalWarning scripts/test-preact-walker.ts
//
// Boots Vite programmatically to ssrLoadModule impower-ui's component registry,
// then expands a sample HTML chunk containing <s-icon> via the walker.
import { createServer } from "vite";
import { expandPreactComponents } from "../src/build/expandPreactComponents.ts";

const SAMPLE = `
<section>
  <h1>Walker smoke test</h1>
  <p>Inline icon: <s-icon class="text-2xl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12l5 5L20 7"/></svg></s-icon> done.</p>
  <p>Not a registered tag, should pass through unchanged: <s-not-registered>hello</s-not-registered></p>
</section>
`.trim();

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  logLevel: "warn",
});

try {
  const mod = await server.ssrLoadModule(
    "/node_modules/@impower/impower-ui/src/components/registry.ts",
  );
  const registry = mod.componentRegistry;
  if (!registry) throw new Error("componentRegistry not exported from impower-ui");

  console.log("Registered tags:", Object.keys(registry));
  console.log("\n=== INPUT ===");
  console.log(SAMPLE);

  const out = expandPreactComponents(SAMPLE, registry);

  console.log("\n=== OUTPUT ===");
  console.log(out);
} finally {
  await server.close();
}
