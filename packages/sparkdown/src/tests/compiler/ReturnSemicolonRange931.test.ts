import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource } from "./grammarSnapshot";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { checkerView } from "./luauCheckerView";
import { jsonLocation, jsonNodes, parseOfficialTree } from "./officialAstTestUtils";
import { printOfficialAst } from "./printOfficialAst";

describe("written return semicolon locations", () => {
  for (const context of ["file", "scene", "branch", "function"]) for (const mark of ["", "& "]) {
    test.each(["return;", "return 5;", "return 1, 2;", "return 5; -- comment", "return 5; --[[comment]]", "return 5 --[[comment]];"])(`${context} ${mark}%s includes its written delimiter`, (line) => {
      const source = `${mark}${line}\n`;
      const text = context === "file" ? source : `${context} a${context === "function" ? "()" : ""}\n${source}end\n`;
      const units = readLuauUnits(parseSource(text), text);
      if (context !== "function" && !mark) {
        expect(units.prelude.statements).toEqual([]);
        expect(units.flows).toEqual([]);
        return;
      }
      const converted = context === "scene" || context === "branch" ? units.flows[0]! : units.prelude;
      expect(converted.errors.map((e) => e.message)).toEqual([]);
      const actual = jsonNodes(printOfficialAst(converted.root, checkerView(text, "_G"))).find((node) => node["type"] === "AstStatReturn");
      expect(actual == null).toBe(false);
      const native = jsonNodes(parseOfficialTree(text.replace("& ", "  ").replace(/(?:scene|branch) a/, "function a()")).root).find((node) => node["type"] === "AstStatReturn")!;
      expect(jsonLocation(actual!)).toEqual(jsonLocation(native));
    });
  }
});

const URI = "inmemory:///main.sd";

class ReturnSession extends SparkdownCompiler {
  check(text: string, version: number) {
    this.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" }] });
    this.compile({ textDocument: { uri: URI } });
    return this._typechecker.checksOf(URI).flatMap((check) =>
      jsonNodes(printOfficialAst(check.sourceModule.root, checkerView(text, "_G")))
        .filter((node) => node["type"] === "AstStatReturn")
        .map((node) => {
          const location = jsonLocation(node);
          return {
            begin: { line: check.unit.lines[location.begin.line], column: location.begin.column },
            end: { line: check.unit.lines[location.end.line], column: location.end.column },
          };
        }));
  }
}

describe("incremental written return semicolon locations", () => {
  test("the same compiler reuses an unchanged marked return when later prose changes", () => {
    const session = new ReturnSession();
    const before = session.check("scene a\n& return 5;\nBefore.\nend\n", 1);
    const after = session.check("scene a\n& return 5;\nAfter.\nend\n", 2);
    expect(after).toEqual(before);
    expect(session.typecheckStats.checked).toBe(0);
    expect(session.typecheckStats.reused).toBeGreaterThan(0);
  });
  for (const context of ["file", "scene", "branch", "function"]) {
    test.each(["return", "return 5", "return 1, 2", "return 5 +"])(`${context} %s updates its cached range when its suffix changes`, (returned) => {
      const session = new ReturnSession();
      const mark = context === "function" ? "" : "& ";
      for (const [version, suffix] of ["", ";", "; -- note", " -- note", ";", ""].entries()) {
        const source = `${mark}${returned}${suffix}\n`;
        const text = context === "file" ? source : `${context} a${context === "function" ? "()" : ""}\n${source}end\n`;
        const warm = session.check(text, version + 1);
        const cold = new ReturnSession().check(text, 1);
        expect(warm).toHaveLength(1);
        expect(warm, `${returned}${suffix}, version ${version + 1}`).toEqual(cold);
        if (!returned.endsWith("+")) {
          const native = jsonNodes(parseOfficialTree(text.replace("& ", "  ").replace(/(?:scene|branch) a/, "function a()")).root)
            .find((node) => node["type"] === "AstStatReturn")!;
          expect(warm[0]).toEqual(jsonLocation(native));
        }
      }
    });
  }
});
