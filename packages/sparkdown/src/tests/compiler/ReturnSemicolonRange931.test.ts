import { describe, expect, test } from "vitest";
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
      const converted = context === "scene" || context === "branch" ? units.flows[0]! : units.prelude;
      expect(converted.errors.map((e) => e.message)).toEqual([]);
      const actual = jsonNodes(printOfficialAst(converted.root, checkerView(text, "_G"))).find((node) => node["type"] === "AstStatReturn")!;
      const native = jsonNodes(parseOfficialTree(text.replace("& ", "  ").replace(/(?:scene|branch) a/, "function a()")).root).find((node) => node["type"] === "AstStatReturn")!;
      expect(jsonLocation(actual)).toEqual(jsonLocation(native));
    });
  }
});
