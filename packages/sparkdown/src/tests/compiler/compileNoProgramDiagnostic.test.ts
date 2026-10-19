// A compile that makes no program says why with an error (#1895): every
// fixture of the compile snapshots, compiled whole, either makes a program or
// reports at least one error. The program harness's compiles hold the same
// (`assertNoSilentNoProgram` in `programCompiler`).
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  assertNoSilentNoProgram,
  programCompiler,
} from "../program/programHarness";

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

describe("a compile snapshot fixture compiled whole", () => {
  it("has fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });
  for (const { name, source } of fixtures) {
    it(`${name} makes a program or reports an error`, () => {
      const { error } = console;
      console.error = () => {};
      try {
        // `compile` asserts it, as every compile of the harness does.
        const { program } = programCompiler({
          "inmemory:///main.sd": source,
        }).compile();
        assertNoSilentNoProgram(program);
      } finally {
        console.error = error;
      }
    });
  }
});
