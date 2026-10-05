import { createHash } from "node:crypto";
import { nextLuauToken } from "../../../compiler/typecheck/readLuauAst";

export const CLASS_DEPENDENCY_HEADING = "No `class` declarations";
/** Exact pinned exclusions audited by #1379; adding a source requires a new audit. */
export const CLASS_DEPENDENCY_EXCLUSIONS = [
  {pin:"7d5f73364fdbbaa984fa545071630eba73cfea98",file:"TypeInfer.classes.test.cpp",name:"isinstance_refines_imported_class",module:"game/A",line:418,
    sha256:"7931f4db5d7768ed46b922e1389e8104ed9ab985b69a9b06231c15f4080f3849"},
  {pin:"7d5f73364fdbbaa984fa545071630eba73cfea98",file:"TypeInfer.modules.test.cpp",name:"export_class",module:"game/A",line:1355,
    sha256:"8833005be1b206445152804e9262e8fa0d5d81f71b32619f52b58e8aa2974304"},
  {pin:"7d5f73364fdbbaa984fa545071630eba73cfea98",file:"TypeInfer.modules.test.cpp",name:"non_exported_class",module:"game/A",line:1389,
    sha256:"32fbaf244eea5bb02482fdd8d5b31fbdc457cd1e7faefd9aaf87255eee22c1c8"},
] as const;

/** Leading statement evidence only, using the converter's existing opaque lexical tokens. */
export function hasLeadingClassDeclaration(source: string): boolean {
  let token = nextLuauToken(0,source);
  if (token?.text === "export") token = nextLuauToken(token.from+1,source);
  if (token?.text !== "class") return false;
  const name = nextLuauToken(token.from+1,source);
  return !!name && /^[A-Za-z_][A-Za-z_0-9]*$/.test(name.text);
}

export function validateClassDependencySource(file: string, name: string, module: string, source: string): void {
  // Match the audit's C++ phase-one CRLF-to-LF normalization only. Never trim,
  // splice, emit, or otherwise rewrite an authored source to gain an exclusion.
  const normalized = source.replace(/\r\n/g,"\n");
  const hash = createHash("sha256").update(normalized).digest("hex");
  const audited = CLASS_DEPENDENCY_EXCLUSIONS.find(record => record.file === file && record.name === name && record.module === module);
  if (!audited || hash !== audited.sha256 || !hasLeadingClassDeclaration(normalized))
    throw Error("Dependency is not the exact audited class source for this case/module: "+module);
}
