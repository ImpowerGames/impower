import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { programCompiler } from "../program/programHarness";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__/compile");

const fixtures = readdirSync(SNAPSHOTS_DIR).flatMap((category) => {
  const dir = join(SNAPSHOTS_DIR, category);
  if (!statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sd"))
    .map((file) => ({
      name: `${category}/${file.slice(0, -3)}`,
      source: readFileSync(join(dir, file), "utf8"),
    }));
});

const collisions = [
  {
    name: "a store named as a numeric for loop's variable",
    source: "function f()\n  for i = 1, 2 do\n    store i = 3\n  end\n  return 0\nend\nscene start\n  Hi {f()}.\nend\n",
  },
  {
    name: "a store named as a generic for loop's variable",
    source: "function f(t)\n  for k, v in pairs(t) do\n    store v = 3\n  end\n  return 0\nend\nscene start\n  Hi {f({})}.\nend\n",
  },
  {
    name: "two top-level stores of one name",
    source: "store tally = 0\nstore tally = 1\n\nscene MAIN\n  Count {tally}.\nend\n",
  },
  {
    name: "a local named as a for loop's variable",
    source: "scene start\n  for i = 1, 2 do\n    local i = 3\n  end\nend\n",
  },
];

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe("a compiler diagnostic", () => {
  for (const { name, source } of [...collisions, ...fixtures]) {
    it(`names no null location for ${name}`, () => {
      const { program } = programCompiler({ "inmemory:///main.sd": source }).compile();
      const messages = Object.values(program.diagnostics ?? {})
        .flat()
        .map((d) => message(d));
      expect(messages.filter((m) => m.includes("on null"))).toEqual([]);
    });
  }
});
