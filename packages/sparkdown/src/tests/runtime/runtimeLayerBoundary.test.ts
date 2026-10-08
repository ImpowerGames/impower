// The runtime layer (`src/runtime`) is what the binary program's engine keeps
// once #705 deletes the object-hierarchy engine (`src/inkjs/engine`). Until
// then a few of its files still import that hierarchy: each such import is
// listed here, and the test fails on one that is not listed, so that the
// layer takes on no new dependency on what the deletion removes, and on a
// listed one that is gone, so that the list shrinks with the work. The
// deletion ends with the list empty.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNTIME = join(SRC, "runtime");

/** Each file of the layer, and each module outside the layer it imports. */
const LEAVING = [
  "CallStack.ts -> inkjs/engine/Story",
  "InkList.ts -> inkjs/engine/Story",
  "JsonSerialisation.ts -> inkjs/engine/ChoicePoint",
  "JsonSerialisation.ts -> inkjs/engine/Container",
  "JsonSerialisation.ts -> inkjs/engine/Divert",
  "JsonSerialisation.ts -> inkjs/engine/VariableReference",
  "Object.ts -> inkjs/engine/Container",
  "Object.ts -> inkjs/engine/SearchResult",
  "Pointer.ts -> inkjs/engine/Container",
];

const SPECIFIER =
  /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\n]+)["']/g;

test("the runtime layer imports nothing outside it but what the deletion removes", () => {
  const leaving: string[] = [];
  for (const file of readdirSync(RUNTIME).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(join(RUNTIME, file), "utf8");
    for (const [, spec] of text.matchAll(SPECIFIER)) {
      if (!spec!.startsWith(".")) continue;
      const target = normalize(join(RUNTIME, spec!));
      const fromRuntime = relative(RUNTIME, target);
      if (!fromRuntime.startsWith("..")) continue;
      leaving.push(
        `${file} -> ${relative(SRC, target).split("\\").join("/")}`,
      );
    }
  }
  expect([...new Set(leaving)].sort()).toEqual([...LEAVING].sort());
});
