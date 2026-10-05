import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { checkLuau } from "./typecheckTestHarness";
import { loadOfficialLuau } from "../compiler/officialLuau";

// The complete raw-string argument from TypeInfer.functions.test.cpp's
// luau_subtyping_is_np_hard, at Luau 7d5f73364fdbbaa984fa545071630eba73cfea98.
// Retain its leading newline and trailing indentation as upstream wrote them.
const source = readFileSync(new URL("./fixtures/1374-luau_subtyping_is_np_hard.luau", import.meta.url), "utf8").replace(/\r\n/g, "\n").slice(0, -1);

test("the exact pinned graph-coloring snippet parses in the conformance harness", async () => {
  expect(createHash("sha256").update(source).digest("hex")).toBe("351c6ec7486f856d5246d8771c2ff45a766509b9b2c81aa148d1abaefd287528");
  const official = await loadOfficialLuau("typecheck");
  expect(official(source).errors).toBe(0);
  expect(official(source).diagnostics).toEqual([]);
  expect(checkLuau(source).syntaxDiagnostics.length).toBe(0);
});
