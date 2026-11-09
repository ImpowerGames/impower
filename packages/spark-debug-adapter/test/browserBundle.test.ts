// @vitest-environment node
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const ENTRY = `${import.meta.dirname}/../src/index.ts`;

const bundleForBrowser = () =>
  build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });

describe("the package entry in a browser bundle", () => {
  it("resolves every import without Node built-ins or host aliases", async () => {
    const result = await bundleForBrowser().catch((error) => error);
    const errors = (result.errors ?? []).map(
      (e: { text: string; location?: { file: string } | null }) =>
        `${e.location?.file ?? ""}: ${e.text}`,
    );
    expect(errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((input) => input.startsWith("node:"))).toEqual([]);
    expect(inputs.some((input) => input.endsWith("@vscode/debugadapter/lib/debugSession.js"))).toBe(true);
    expect(inputs.filter((input) => /debugadapter\/lib\/(internalLogger|runDebugAdapter)\.js$/.test(input))).toEqual([]);
  });
});
