import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisProject } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });

test("ordinary author function types reject definition-only checked attributes", async () => {
  const source = "type Callback = @checked (number) -> number\n"
    + "local callback: Callback = function(n: number): number return n end\n"
    + "local value = callback(1)\nlocal wrong: string = value\nreturn value\n";
  const backend = createNodeAnalysisBackend();
  const raw = await backend.createProject({ mode: "strict" }); projects.push(raw);
  await raw.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] });
  const official = await raw.check("main");
  expect(official.status).toBe("ok");
  expect(official.diagnostics.some(diagnostic => diagnostic.code === 1014)).toBe(true);
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors.length).toBeGreaterThan(0);
});

test("official host definitions retain checked function type behavior for raw and decoded callers", async () => {
  const definition = "declare callback: @checked (number) -> number\n";
  const source = 'local result = callback("text")\nreturn result\n';
  const backend = createNodeAnalysisBackend();
  const raw = await backend.createProject({ mode: "nonstrict" }); projects.push(raw);
  const decoded = await backend.createProject({ mode: "nonstrict" }); projects.push(decoded);
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  const ast = encodeSparkdownAnalysisAst(unit);
  await raw.update({ projectVersion: 1, definitions: [{ name: "host", version: 1, source: definition }],
    documents: [{ module: "main", version: 1, source }] });
  await decoded.update({ projectVersion: 1, definitions: [{ name: "host", version: 1, source: definition }],
    documents: [{ kind: "ast", module: "main", version: 1, ast: packSparkdownAnalysisAst(ast) }] });
  const official = await raw.check("main"), checked = await decoded.check("main");
  expect(official.status).toBe("ok"); expect(checked.status).toBe("ok");
  expect(official.diagnostics.length).toBeGreaterThan(0);
  expect(checked.work?.parsedModules).toBe(0); expect(checked.diagnostics).toEqual(official.diagnostics);
  expect((await decoded.queryType(checked.documents[0]!, { line: 1, column: 8 })).type)
    .toBe((await raw.queryType(official.documents[0]!, { line: 1, column: 8 })).type);
  const update = await decoded.update({ projectVersion: 2, definitions: [{ name: "host", version: 2, source: definition.replace("@checked ", "") }] });
  expect(update.status).toBe("ok"); expect(update.work?.decodedInputs).toBe(0);
  const unchecked = await decoded.check("main"); expect(unchecked.status).toBe("ok");
  expect(unchecked.diagnostics).toEqual([]);
});
