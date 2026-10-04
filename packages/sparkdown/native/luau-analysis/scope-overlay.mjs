// Maintained preparation hooks over the exact pinned official solver.
// The input checkout is read-only; five adapted files and one unchanged
// source-relative support header are materialized outside it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";

export const SCOPE_OVERLAY_PIN = "7d5f73364fdbbaa984fa545071630eba73cfea98";
const hash = value => createHash("sha256").update(value).digest("hex");
export const scopeOverlay = [
  {
    path: "Analysis/src/AutocompleteCore.h",
    sha256: "87efeccbf2ec22df328215b20ec36eda6345cbd7ca6318e761f9631c7080c985",
    edits: [],
  },
  {
    path: "Analysis/include/Luau/ConstraintGenerator.h",
    sha256: "1eddf5eb912c8fa9de6face403a1016fdce68a4c022c451a2f7616dc72b6b1c3",
    edits: [{
      before: "    std::function<void(const ModuleName&, const ScopePtr&)> prepareModuleScope;\n",
      after: "    std::function<void(const ModuleName&, const ScopePtr&)> prepareModuleScope;\n    // Optional host lexical imports into the separate module-local type-function environment.\n    std::function<void(const ModuleName&, const ScopePtr&)> prepareTypeFunctionScope;\n",
    }],
  },
  {
    path: "Analysis/include/Luau/Frontend.h",
    sha256: "5b74050ad372ec22447e9b2e49064f119bd53af9dabe3b36568732544628df94",
    edits: [{
      before: "    std::function<void(const ModuleName& name, const ScopePtr& scope, bool forAutocomplete)> prepareModuleScope;\n",
      after: "    std::function<void(const ModuleName& name, const ScopePtr& scope, bool forAutocomplete)> prepareModuleScope;\n    std::function<void(const ModuleName& name, const ScopePtr& scope, bool forAutocomplete)> prepareTypeFunctionScope;\n",
    }, {
      before: "    std::function<void(const ModuleName&, std::string)> writeJsonLog\n);",
      after: "    std::function<void(const ModuleName&, std::string)> writeJsonLog,\n    std::function<void(const ModuleName&, const ScopePtr&)> prepareTypeFunctionScope = {}\n);",
    }],
  },
  {
    path: "Analysis/src/ConstraintGenerator.cpp",
    sha256: "75d488b84d53dec57465bd59e6ca0212c9bfd0ba474154f607010d173d1cfbfa",
    edits: [{
      before: "    // Handle type function globals as well, without preparing a module scope since they have a separate environment\n    GlobalPrepopulator tfgp{NotNull{typeFunctionRuntime->rootScope.get()}, arena, dfg};",
      after: "    // Lexical type-function imports belong only to this module-local environment.\n    if (prepareTypeFunctionScope)\n        prepareTypeFunctionScope(module->name, typeFunctionRuntime->rootScope);\n\n    // Handle type function globals as well, without preparing the ordinary module scope.\n    GlobalPrepopulator tfgp{NotNull{typeFunctionRuntime->rootScope.get()}, arena, dfg};",
      count: 2,
    }],
  },
  {
    path: "Analysis/src/Frontend.cpp",
    sha256: "ec625dd3ba6739b9742d34dc4204c8517819c17b267bab337bf18c98b7c270d8",
    edits: [{
      before: "        ConstraintSet cgResult = cg.run(sourceModule.root);",
      after: "        cg.prepareTypeFunctionScope = [this](const ModuleName& name, const ScopePtr& scope)\n        {\n            if (prepareTypeFunctionScope)\n                prepareTypeFunctionScope(name, scope, false);\n        };\n\n        ConstraintSet cgResult = cg.run(sourceModule.root);",
    }, {
      before: "    std::function<void(const ModuleName&, std::string)> writeJsonLog\n)\n{\n    LUAU_TIMETRACE_SCOPE(\"Frontend::check\", \"Typechecking\");",
      after: "    std::function<void(const ModuleName&, std::string)> writeJsonLog,\n    std::function<void(const ModuleName&, const ScopePtr&)> prepareTypeFunctionScope\n)\n{\n    LUAU_TIMETRACE_SCOPE(\"Frontend::check\", \"Typechecking\");",
    }, {
      before: "    ConstraintSet constraintSet = cg.run(sourceModule.root);",
      after: "    cg.prepareTypeFunctionScope = std::move(prepareTypeFunctionScope);\n    ConstraintSet constraintSet = cg.run(sourceModule.root);",
    }, {
      before: "                stats,\n                writeJsonLog\n            );",
      after: "                stats,\n                writeJsonLog,\n                [this, forAutocomplete](const ModuleName& name, const ScopePtr& scope)\n                {\n                    if (prepareTypeFunctionScope)\n                        prepareTypeFunctionScope(name, scope, forAutocomplete);\n                }\n            );",
    }],
  },
  {
    path: "Analysis/src/FragmentAutocomplete.cpp",
    sha256: "5d8d462b95c36f2e5344cc92db52fa5a75ad4ce52569d38d9e38be850b9a72f7",
    edits: [{
      before: "    CloneState cloneState{frontend.builtinTypes};\n    incrementalModule->scopes.emplace_back(root->location, freshChildOfNearestScope);",
      after: "    cg.prepareTypeFunctionScope = [&frontend, &opts](const ModuleName& name, const ScopePtr& scope)\n    {\n        if (frontend.prepareTypeFunctionScope)\n            frontend.prepareTypeFunctionScope(name, scope, opts.forAutocomplete);\n    };\n\n    CloneState cloneState{frontend.builtinTypes};\n    incrementalModule->scopes.emplace_back(root->location, freshChildOfNearestScope);",
    }],
  },
];

export function applyScopeOverlayFile(spec, input) {
  let text = Buffer.from(input).toString("utf8").replaceAll("\r\n", "\n");
  if (hash(text) !== spec.sha256) throw Error("Scope overlay preimage differs: " + spec.path);
  for (const edit of spec.edits) {
    const occurrences = text.split(edit.before).length - 1;
    if (occurrences !== (edit.count ?? 1)) throw Error("Scope overlay hunk count differs: " + spec.path);
    text = text.split(edit.before).join(edit.after);
  }
  return { path: spec.path, inputSha256: hash(input), canonicalInputSha256: spec.sha256, outputSha256: hash(text), text };
}

export function scopeOverlayDestination(sourceRoot, outputRoot) {
  const source = resolve(sourceRoot), output = resolve(outputRoot);
  const destination = relative(source, output);
  if (!destination || (destination !== ".." && !destination.startsWith(".." + sep) && !isAbsolute(destination)))
    throw Error("Scope overlay output must be outside the read-only source checkout");
  return output;
}

export function materializeScopeOverlay(sourceRoot, outputRoot) {
  return materializeScopeOverlayFiles(sourceRoot, outputRoot, scopeOverlay);
}

export function materializeScopeOverlayFiles(sourceRoot, outputRoot, files) {
  const source = resolve(sourceRoot), output = scopeOverlayDestination(sourceRoot, outputRoot);
  // Validate every preimage and hunk before writing any output.
  const prepared = files.map(spec => applyScopeOverlayFile(spec, readFileSync(join(source, spec.path))));
  for (const file of prepared) {
    const path = join(output, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.text);
  }
  return { pin: SCOPE_OVERLAY_PIN, definitionSha256: hash(JSON.stringify(files)),
    files: prepared.map(({ path, inputSha256, canonicalInputSha256, outputSha256 }) => ({ path, inputSha256, canonicalInputSha256, outputSha256 })) };
}
