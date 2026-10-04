import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownAnalysisInputs } from "../../compiler/typecheck/SparkdownAnalysisInputs";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const read = (source: string) => {
  const units = sparkdownUnits(compiler.documents.parser.parse(source), source);
  return [units.prelude, ...units.flows];
};
const prelude = "function give(value: number): number\n  return value\nend\n\n";
const alpha = "scene alpha\n  local value: number = give(1)\n  A narrative line.\nend\n\n";
const beta = "scene beta\n  local value: number = give(2)\nend\n";
const source = prelude + alpha + beta;
const uri = "inmemory:///main.sd";

describe("Sparkdown analysis input retention", () => {
  test("unpublished native attempts retain the old maps and a successful retry commits all maps together", () => {
    const cache = new SparkdownAnalysisInputs();
    const old = cache.update(uri, 1, read(source));
    const other = cache.update("other.sd", 1, read(source));
    const changed = cache.prepare(uri, 2, read(source.replace("return value", "return 2")));
    const shifted = cache.prepare("other.sd", 2, read("Story.\n" + source));
    // A rejected/cancelled backend attempt never calls publish.
    expect(cache.current(old)).toBe(true); expect(cache.current(other)).toBe(true);
    expect(cache.current(changed)).toBe(false); expect(cache.current(shifted)).toBe(false);
    expect(cache.unitPosition(old, old.units[1]!.lines[1]!, 9)).toBeDefined();
    const retry = cache.prepare(uri, 2, read(source.replace("return value", "return 2")));
    expect(retry.units[0]!.unitVersion).toBe(old.units[0]!.unitVersion + 1);
    expect(retry.stats).toEqual({ encoded: 1, reused: 2 });
    cache.publish([retry, shifted]);
    expect(cache.current(retry)).toBe(true); expect(cache.current(shifted)).toBe(true);
    expect(cache.current(old)).toBe(false); expect(cache.current(other)).toBe(false);
    expect(() => cache.publish([changed])).toThrow("Stale analysis publication");
  });

  test("stale multi-document publication and removal reject without partially committing another map", () => {
    const cache = new SparkdownAnalysisInputs();
    const old = cache.update(uri, 1, read(source));
    const other = cache.update("other.sd", 1, read(source));
    const changed = cache.prepare(uri, 2, read(source.replace("return value", "return 2")));
    const stagedOther = cache.prepare("other.sd", 2, read("Story.\n" + source));
    const winner = cache.update("other.sd", 2, read(source));
    expect(() => cache.publish([changed, stagedOther])).toThrow("Stale analysis publication");
    expect(cache.current(old)).toBe(true); expect(cache.current(winner)).toBe(true);
    expect(() => cache.publish([changed], [other])).toThrow("Stale analysis removal");
    expect(cache.current(old)).toBe(true); expect(cache.current(winner)).toBe(true);
    cache.publish([changed], [winner]);
    expect(cache.current(changed)).toBe(true); expect(cache.current(winner)).toBe(false);
    expect(cache.unitPosition(old, old.units[1]!.lines[1]!, 9)).toBeUndefined();
  });

  test("no-op and narrative shifts avoid encoding unchanged units and retain immutable maps", () => {
    const cache = new SparkdownAnalysisInputs();
    const cold = cache.update(uri, 1, read(source));
    const noop = cache.update(uri, 1, read(source));
    const shifted = cache.update(uri, 2, read(source.replace("A narrative line.", "An edited narrative line.\n  Another line.")));
    expect(cold.stats).toEqual({ encoded: 3, reused: 0 });
    for (const warm of [noop, shifted]) {
      expect(warm.stats).toEqual({ encoded: 0, reused: 3 });
      expect(warm.updates).toEqual([]);
      expect(warm.units.map(unit => unit.module)).toEqual(cold.units.map(unit => unit.module));
      warm.units.forEach((unit, index) => expect(unit.ast).toBe(cold.units[index]!.ast));
    }
    expect(shifted.units[2]!.lines[0]).toBe(cold.units[2]!.lines[0]! + 1);
    expect(cache.current(cold)).toBe(false);
    expect(cache.unitPosition(cold, cold.units[2]!.lines[0]!, 2)).toBeUndefined();
    expect(Object.isFrozen(cold.units[0]!.ast.nodes[0]!.fields)).toBe(true);
  });

  test("a changed function encodes only its prelude without claiming unchanged exports", () => {
    const cache = new SparkdownAnalysisInputs();
    const cold = cache.update(uri, 1, read(source));
    const changed = cache.update(uri, 2, read(source.replace("return value", "return 2")));
    expect(changed.stats).toEqual({ encoded: 1, reused: 2 });
    expect(changed.updates[0]!.module).toBe(cold.units[0]!.module);
    expect(changed.updates[0]!.unitVersion).toBe(2);
    for (const index of [1, 2]) expect(changed.units[index]!.ast).toBe(cold.units[index]!.ast);
  });

  test("reordering retains identities and deleting a unit removes its native input", () => {
    const cache = new SparkdownAnalysisInputs();
    const cold = cache.update(uri, 1, read(source));
    const reordered = cache.update(uri, 2, read(prelude + beta + alpha));
    expect(reordered.stats).toEqual({ encoded: 0, reused: 3 });
    expect(reordered.units[1]!.module).toBe(cold.units[2]!.module);
    expect(reordered.units[2]!.module).toBe(cold.units[1]!.module);
    const removed = cache.update(uri, 3, read(prelude + beta));
    expect(removed.removals).toEqual([cold.units[1]!.module]);
    expect(cache.remove(uri)).toEqual(removed.units.map(unit => unit.module));
    expect(cache.current(removed)).toBe(false);
  });

  test("identical duplicate units have distinct module identities", () => {
    const cache = new SparkdownAnalysisInputs();
    const units = read(source);
    const cold = cache.update(uri, 1, [units[0]!, units[1]!, units[1]!]);
    expect(cold.units[1]!.module).not.toBe(cold.units[2]!.module);
    const warm = cache.update(uri, 2, [units[0]!, units[1]!, units[1]!]);
    expect(warm.stats).toEqual({ encoded: 0, reused: 3 });
    expect(warm.units.map(unit => unit.module)).toEqual(cold.units.map(unit => unit.module));
  });

  test("stale versions, changed same-version input and failed encoding preserve the current snapshot", () => {
    const cache = new SparkdownAnalysisInputs();
    const cold = cache.update(uri, 2, read(source));
    expect(() => cache.update(uri, 1, read(source))).toThrow("Stale");
    expect(() => cache.update(uri, 2, read(source.replace("return value", "return 2")))).toThrow("new document version");
    const invalid = read(source.replace("return value", "return 2"));
    (invalid[0]!.root as unknown as Record<string, unknown>)["unsupportedField"] = true;
    expect(() => cache.update(uri, 3, invalid)).toThrow("field");
    expect(cache.current(cold)).toBe(true);
  });

  test("current UTF16 query mappings preserve columns across CRLF and Unicode narrative", () => {
    const cache = new SparkdownAnalysisInputs();
    const snapshot = cache.update(uri, 1, read(("😀 story\n" + source).replaceAll("\n", "\r\n")));
    const unit = snapshot.units[1]!;
    expect(cache.unitPosition(snapshot, unit.lines[1]!, 19)).toEqual({
      module: unit.module, unitVersion: unit.unitVersion, line: 1, column: 19,
    });
    expect(cache.unitPosition(snapshot, 0, 1)).toBeUndefined();
  });
});
