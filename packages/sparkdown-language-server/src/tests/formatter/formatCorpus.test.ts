import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";
import { tokenChange } from "./tokenChanges";

// Every tracked `.sd` file formats to text a second format leaves alone, and
// its first format loses, adds or joins no token (I-874, I-1238). The format
// snapshots check this for their own fixtures; this covers the grammar,
// compiler and runtime fixtures and the examples too.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.sd"], {
  cwd: REPO,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean);

test("the corpus holds the tracked scripts", () => {
  expect(tracked.length).toBeGreaterThan(0);
});

describe("tracked scripts format stably", () => {
  for (const path of tracked) {
    test(path, () => {
      const source = readFileSync(join(REPO, path), "utf8").replace(
        /\r\n|\r/g,
        "\n",
      );
      const once = formatSource(source);
      expect(tokenChange(source, once)).toBeUndefined();
      expect(formatSource(once)).toBe(once);
    });
  }
});
