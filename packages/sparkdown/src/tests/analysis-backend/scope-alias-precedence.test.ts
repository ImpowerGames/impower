import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
function document(module: string, source: string, kind: "ast" | "source") {
  if (kind === "source") return { module, version: 1, source };
  const unit = luauFileUnit(source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return { module, version: 1, kind: "ast" as const, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}

// Original exact AST string-versus-number RED is preserved privately; the raw
// control exercises the same native lexical split without converter ingestion.
test.each(["ast", "source"] as const)("a root exported alias shadows an inherited private alias in the downstream snapshot (%s)", async kind => {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  try {
    await p.update({ projectVersion: 1, documents: [document("outer", "type A = number\n", kind),
      document("root", 'export type A = string\nlocal own: A = "x"\nreturn own\n', kind),
      document("downstream", "local observed: A = nil :: any\nreturn observed\n", kind)],
      scopeLinks: [{ module: "root", version: 1, prelude: "outer" }, { module: "downstream", version: 1, prelude: "root" }] });
    const checked = await p.check("downstream"); expect(checked.status, checked.message).toBe("ok"); expect(checked.diagnostics).toEqual([]);
    const root = checked.documents.find(handle => handle.module === "root")!;
    const downstream = checked.documents.find(handle => handle.module === "downstream")!;
    const live = await p.queryType(root, { line: 2, column: 7 }), copied = await p.queryType(downstream, { line: 1, column: 7 });
    const liveFacts = await p.queryScopeSourceMetadata(root, { namespace: "alias", name: "A" });
    const copiedFacts = await p.queryScopeSourceMetadata(downstream, { namespace: "alias", name: "A" });
    console.log("Exact root alias precedence", { live, copied, liveFacts, copiedFacts });
    expect(liveFacts.status).toBe("ok"); expect(liveFacts.supported).toBe(true);
    expect(liveFacts.origin?.fields.every(field => field.module === "root")).toBe(true);
    expect(copiedFacts.status).toBe("ok");
    expect(copiedFacts.supported).toBe(true); expect(copiedFacts.origin).toEqual(liveFacts.origin);
    expect(live.type).toBe("string"); expect(copied.type).toBe(live.type);
  } finally { await p.dispose(); }
});

test.each(["ast", "source"].flatMap(kind => ["private-only", "exported-only"].map(policy => ({ kind: kind as "ast" | "source", policy }))))(
  "selected $policy alias and value shadowing survive two transitive snapshots ($kind)", async ({ kind, policy }) => {
    const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
    try {
      const outer = policy === "private-only" ? 'type A = number\nlocal shared = {count = 1}\n' : 'type B = number\nlocal shared = {count = 1}\n';
      const root = (policy === "exported-only" ? "export " : "") + 'type A = string\nlocal shared = {label = "own"}\nlocal own: A = "x"\nreturn own\n';
      const middle = "local current: A = nil :: any\nlocal label: string = shared.label\nreturn current\n";
      const caller = "local current: A = nil :: any\nlocal label: string = shared.label\nreturn current\n";
      await p.update({ projectVersion: 1, documents: [document("outer", outer, kind), document("root", root, kind),
        document("middle", middle, kind), document("caller", caller, kind)], scopeLinks: [
        { module: "root", version: 1, prelude: "outer" }, { module: "middle", version: 1, prelude: "root" }, { module: "caller", version: 1, prelude: "middle" },
      ] });
      const check = await p.check("caller"); expect(check.status, check.message).toBe("ok"); expect(check.diagnostics).toEqual([]);
      const rootHandle = check.documents.find(handle => handle.module === "root")!;
      const original = await p.queryScopeSourceMetadata(rootHandle, { namespace: "alias", name: "A" });
      expect(original.status).toBe("ok"); expect(original.supported).toBe(true);
      expect(original.origin?.fields.every(field => field.module === "root")).toBe(true);
      for (const module of ["middle", "caller"]) {
        const current = check.documents.find(handle => handle.module === module)!;
        const scalar = await p.queryType(current, { line: 2, column: 7 });
        const alias = await p.queryScopeSourceMetadata(current, { namespace: "alias", name: "A" });
        console.log("Transitive selected alias", { kind, policy, module, scalar, alias });
        expect(scalar.status).toBe("ok"); expect(scalar.type).toBe("string");
        expect(alias.supported).toBe(true); expect(alias.origin).toEqual(original.origin);
        expect((await p.queryType(current, { line: 1, column: 29 })).type).toBe("string");
      }
      expect((await p.check("caller")).checkedModules).toBe(0);
    } finally { await p.dispose(); }
  });
