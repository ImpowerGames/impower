import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { applyScopeOverlayFile, materializeScopeOverlay, materializeScopeOverlayFiles, scopeOverlay, scopeOverlayDestination, type ScopeOverlayFile } from "../../../native/luau-analysis/scope-overlay.mjs";

const original = "class Frontend {\n    void prepareModule();\n};\n";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const spec: ScopeOverlayFile = { path: "Analysis/include/Luau/Frontend.h", sha256: sha(original), edits: [{
  before: "    void prepareModule();\n", after: "    void prepareModule();\n    void prepareTypeFunctionScope();\n",
}] };

test("canonical pinned preimages yield identical LF overlays from LF and CRLF checkouts", () => {
  const lf = Buffer.from(original), crlf = Buffer.from(original.replaceAll("\n", "\r\n"));
  const a = applyScopeOverlayFile(spec, lf), b = applyScopeOverlayFile(spec, crlf);
  expect(a.text).toBe("class Frontend {\n    void prepareModule();\n    void prepareTypeFunctionScope();\n};\n");
  expect(b.text).toBe(a.text); expect(b.outputSha256).toBe(a.outputSha256);
  expect(b.canonicalInputSha256).toBe(a.canonicalInputSha256); expect(b.inputSha256).not.toBe(a.inputSha256);
  expect(lf.toString()).toBe(original); expect(crlf.toString()).toBe(original.replaceAll("\n", "\r\n"));
});

test("a changed preimage or missing/duplicated hunk rejects rather than silently changing the solver", () => {
  expect(() => applyScopeOverlayFile(spec, Buffer.from(original.replace("prepareModule", "prepareOther")))).toThrow("preimage differs");
  expect(() => applyScopeOverlayFile({ ...spec, edits: [{ before: "absent", after: "replacement" }] }, Buffer.from(original))).toThrow("hunk count differs");
  const duplicated = original.replace("    void prepareModule();\n", "    void prepareModule();\n    void prepareModule();\n");
  expect(() => applyScopeOverlayFile({ ...spec, sha256: sha(duplicated) }, Buffer.from(duplicated))).toThrow("hunk count differs");
  expect(() => materializeScopeOverlay("/read-only-pin", "/read-only-pin/overlay")).toThrow("outside the read-only source checkout");
});

test("a child directory beginning with two dots is still inside the read-only checkout", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sparkdown-overlay-boundary-"));
  console.log("Scope overlay containment scratch:", scratch);
  expect(() => materializeScopeOverlay(scratch, join(scratch, "..overlay"))).toThrow("outside the read-only source checkout");
  const source = join(scratch, "pin"), sibling = join(scratch, "patched");
  expect(scopeOverlayDestination(source, sibling)).toBe(resolve(sibling));
});

test("copied fragment sources retain their actual source-relative support header", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sparkdown-overlay-includes-"));
  console.log("Scope overlay include scratch:", scratch);
  const source = join(scratch, "pin"), output = join(scratch, "patched");
  mkdirSync(join(source, "Analysis/src"), { recursive: true });
  // Exact include from pinned FragmentAutocomplete.cpp:25. This bounded
  // fixture checks source layout, without pretending to compile the snippet.
  const fragment = '#include "AutocompleteCore.h"\n';
  writeFileSync(join(source, "Analysis/src/FragmentAutocomplete.cpp"), fragment);
  const header = `// This file is part of the Luau programming language and is licensed under MIT License; see LICENSE.txt for details
#pragma once

#include "Luau/AutocompleteTypes.h"

namespace Luau
{
struct Module;
struct FileResolver;

using ModulePtr = std::shared_ptr<Module>;
using ModuleName = std::string;


AutocompleteResult autocomplete_(
    const ModulePtr& module,
    NotNull<BuiltinTypes> builtinTypes,
    TypeArena* typeArena,
    std::vector<AstNode*>& ancestry,
    Scope* globalScope,
    const ScopePtr& scopeAtPosition,
    Position position,
    FileResolver* fileResolver,
    StringCompletionCallback callback,
    bool isInHotComment = false
);

} // namespace Luau
`;
  expect(sha(header)).toBe("87efeccbf2ec22df328215b20ec36eda6345cbd7ca6318e761f9631c7080c985");
  writeFileSync(join(source, "Analysis/src/AutocompleteCore.h"), header);
  const files = scopeOverlay.filter(file => file.path === "Analysis/src/FragmentAutocomplete.cpp" || file.path === "Analysis/src/AutocompleteCore.h")
    .map(file => file.path.endsWith(".cpp") ? { ...file, sha256: sha(fragment), edits: [] } : file);
  materializeScopeOverlayFiles(source, output, files);
  expect(readFileSync(join(output, "Analysis/src/FragmentAutocomplete.cpp"), "utf8")).toBe(fragment);
  expect(readFileSync(join(output, "Analysis/src/AutocompleteCore.h"), "utf8")).toBe(header);
  expect(readFileSync(join(source, "Analysis/src/AutocompleteCore.h"), "utf8")).toBe(header);
});
