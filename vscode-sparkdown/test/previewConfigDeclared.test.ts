import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => ({ paths: new Set<string>() }));

vi.mock("vscode", () => {
  const record = (path: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, key) => {
          if (typeof key !== "string") {
            return undefined;
          }
          const next = `${path}.${key}`;
          read.paths.add(next);
          return record(next);
        },
      },
    );
  return {
    workspace: {
      getConfiguration: (section: string) => record(section),
    },
  };
});
vi.mock("../src/utils/getActiveSparkdownDocument", () => ({
  getActiveSparkdownDocument: () => undefined,
}));

describe("getSparkdownPreviewConfig", () => {
  it("reads only settings the extension declares", async () => {
    const { getSparkdownPreviewConfig } =
      await import("../src/utils/getSparkdownPreviewConfig");
    getSparkdownPreviewConfig();
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const declared = new Set(
      [manifest.contributes.configuration]
        .flat()
        .flatMap((section) => Object.keys(section.properties ?? {})),
    );
    const leaves = [...read.paths].filter(
      (path) =>
        path.startsWith("sparkdown.") &&
        ![...read.paths].some((other) => other.startsWith(`${path}.`)),
    );
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.filter((path) => !declared.has(path))).toEqual([]);
  });
});
