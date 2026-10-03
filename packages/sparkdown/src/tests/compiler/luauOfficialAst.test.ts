import { beforeAll, describe, expect, test } from "vitest";
import {
  AstExprGlobal,
  AstExprCall,
  AstExprFunction,
  AstExprSparkdownFlowArgument,
  AstStatFunction,
  AstStatAssign,
  AstStatSparkdownStore,
  visitAst,
} from "../../compiler/typecheck/Ast";
import { Location, Position } from "../../compiler/typecheck/Location";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";
import {
  checkerTextUnits,
  textDocumentPosition,
  type LuauTextUnit,
} from "./luauCheckerText";
import { checkerView } from "./luauCheckerView";
import { luauInputs, UNSUPPORTED_INTEGER_INPUTS, type LuauInput } from "./luauFixtures";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";
import {
  expressionDocument,
  generatedExpressions,
} from "./luauGeneratedExpressions";
import {
  loadOfficialLuau,
  officialLuauAvailable,
  type Json,
} from "./officialLuau";
import { printOfficialAst } from "./printOfficialAst";

// Every exemption is explicit here. Locations absent from the upstream encoder
// are not invented; all locations it does emit are compared in document units.
const EXEMPTIONS = [
  "AstExprFunction.varargLocation when vararg is false: no source token",
  "The __flow wrapper header: wrapper name and the begins of its containing blocks",
  "The synthesized end of an unclosed __flow wrapper: ends of its containing blocks",
  "Substituted Sparkdown expression ends, including containing spans; begins still compare",
  "Branch initializer values and the containing local's end are written past the header",
  "A function body begin after a synthesized parameter list has no written token",
  "Error units compare only the presence of syntax errors, not recovery trees",
  "Lexical commentLocations are not part of the converter's AST",
] as const;
const KNOWN = [
  // This is the official-parser list. Port-only #1304/#1305/#1306 no longer
  // disagree here, so inheriting that oracle's list would hide passing inputs.
  { input: "grammar/luau-function/return-before-prose.sd", issue: 1298 },
];
if (!officialLuauAvailable)
  console.warn(
    "Official Luau AST comparison SKIPPED: missing upstream/ast/luau-ast.cjs or .wasm; rebuild per VENDORING.md",
  );

function mapLocations(
  value: Json,
  map: (line: number, column: number) => { line: number; character: number },
): Json {
  if (Array.isArray(value)) return value.map((v) => mapLocations(v, map));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !(
            value["type"] === "AstExprFunction" &&
            value["vararg"] === false &&
            key === "varargLocation"
          ),
      )
      .map(([key, item]) => {
        if (typeof item === "string" && /^(location|.*Location)$/.test(key)) {
          const coordinates = item.match(/^(\d+),(\d+) - (\d+),(\d+)$/);
          if (!coordinates) throw new Error(`Invalid location ${item}`);
          const [, a, b, c, d] = coordinates.map(Number);
          const begin = map(a!, b!);
          const end = map(c!, d!);
          return [
            key,
            `${begin.line},${begin.character} - ${end.line},${end.character}`,
          ];
        }
        return [key, mapLocations(item, map)];
      }),
  );
}

/** Compact first mismatch includes its complete nesting path, never a huge AST diff. */
function difference(a: Json, b: Json, path = "root"): string[] {
  if (Object.is(a, b)) return [];
  if (Array.isArray(a) !== Array.isArray(b))
    return [`${path}: array/object shape differs`];
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return [
      `${path}: official ${JSON.stringify(a)}, converter ${JSON.stringify(b)}`,
    ];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    const left = (a as Record<string, Json>)[key];
    const right = (b as Record<string, Json>)[key];
    if (left === undefined || right === undefined)
      return [
        `${path}.${key}: missing on ${left === undefined ? "official" : "converter"}`,
      ];
    const result = difference(left, right, `${path}.${key}`);
    if (result.length) return result;
  }
  return [];
}

describe.skipIf(!officialLuauAvailable)(
  officialLuauAvailable
    ? "Official Luau AST, including document positions"
    : "Official Luau AST SKIPPED: missing upstream/ast/luau-ast.cjs or .wasm; see VENDORING.md",
  () => {
    let parse: Awaited<ReturnType<typeof loadOfficialLuau>>;
    beforeAll(async () => {
      parse = await loadOfficialLuau();
    });

    function fixtureDifferences(
      input: LuauInput,
      mutate?: (units: ReturnType<typeof readLuauUnits>) => void,
    ): string[] {
      const tree = parseSource(input.text);
      const ours = readLuauUnits(tree, input.text);
      mutate?.(ours);
      const compare = (
        source: string,
        root: Parameters<typeof printOfficialAst>[0],
        errors: number,
        map: (
          line: number,
          column: number,
        ) => { line: number; character: number },
        anyName = "_G",
        run = false,
        flow?: LuauTextUnit,
      ) => {
        const parsed = parse(source);
        if (parsed.errors || errors)
          return Boolean(parsed.errors) === Boolean(errors)
            ? []
            : [`syntax errors: official ${parsed.errors}, converter ${errors}`];
        const official = run
          ? (parsed.root as { body: Json[] }).body[0]!
          : parsed.root;
        const baseView = checkerView(input.text, anyName);
        const shortenedEnds = new Map<string, string>();
        const argumentLocations = new Set<string>();
        const syntheticBodyBegins = new Set<string>();
        const point = (p: Position) => `${p.line},${p.column}`;
        visitAst(root, {
          visit: (node) => {
            if (
              node instanceof AstExprFunction &&
              (!node.argLocation ||
                node.argLocation.begin.equals(node.argLocation.end))
            )
              syntheticBodyBegins.add(point(node.body.location.begin));
            return true;
          },
        });
        const oursJson = printOfficialAst(root, (node) => {
          const replacement = baseView(node);
          if (
            node instanceof AstStatSparkdownStore &&
            replacement instanceof AstStatAssign
          ) {
            // `store` is blanked; an assignment begins at its first variable.
            replacement.location = new Location(
              node.vars[0]!.location.begin,
              node.location.end,
            );
          }
          if (node instanceof AstExprSparkdownFlowArgument) {
            argumentLocations.add(
              `${point(node.location.begin)} - ${point(node.location.end)}`,
            );
          } else if (
            node.kind.startsWith("Sparkdown") &&
            (replacement instanceof AstExprCall ||
              replacement instanceof AstExprGlobal)
          ) {
            const begin = node.location.begin;
            const end = new Position(
              begin.line,
              begin.column + (replacement instanceof AstExprCall ? 4 : 2),
            );
            shortenedEnds.set(point(node.location.end), point(end));
            if (replacement instanceof AstExprCall) {
              const parens = new Position(begin.line, begin.column + 2);
              replacement.func.location = new Location(begin, parens);
              replacement.argLocation = new Location(
                new Position(begin.line, begin.column + 3),
                end,
              );
            }
          }
          return replacement;
        });
        const left = mapLocations(official, map);
        const right = mapLocations(oursJson, (line, character) => ({
          line,
          character,
        }));
        // These are paired only to erase the explicitly named synthetic spans.
        // No real begin, field value, child order or node type is copied across.
        const exemptRewrites = (a: Json, b: Json) => {
          if (!a || !b || typeof a !== "object" || typeof b !== "object")
            return;
          const left = a as Record<string, Json>;
          const right = b as Record<string, Json>;
          const location = right["location"];
          if (
            typeof location === "string" &&
            typeof left["location"] === "string"
          ) {
            const [begin, end] = location.split(" - ");
            const [theirBegin, theirEnd] = left["location"].split(" - ");
            if (
              right["type"] === "AstExprGlobal" &&
              argumentLocations.has(location)
            ) {
              left["location"] = right["location"] = "<branch initializer>";
            } else if (
              right["type"] === "AstStatLocal" &&
              Array.isArray(right["values"]) &&
              right["values"].some(
                (v) =>
                  v &&
                  typeof v === "object" &&
                  argumentLocations.has(
                    String((v as Record<string, Json>)["location"]),
                  ),
              )
            ) {
              left["location"] = `${theirBegin} - <branch initializer end>`;
              right["location"] = `${begin} - <branch initializer end>`;
            } else if (
              right["type"] === "AstStatBlock" &&
              syntheticBodyBegins.has(begin!)
            ) {
              left["location"] = `<synthetic parameters> - ${theirEnd}`;
              right["location"] =
                `<synthetic parameters> - ${shortenedEnds.get(end!) ?? end}`;
            } else if (shortenedEnds.has(end!))
              right["location"] = `${begin} - ${shortenedEnds.get(end!)}`;
          }
          for (const key of Object.keys(left))
            if (right[key] !== undefined)
              exemptRewrites(left[key]!, right[key]!);
        };
        exemptRewrites(left, right);
        if (flow) {
          const at = (root: Json, path: string[]) =>
            path.reduce(
              (value, key) => (value as Record<string, Json>)[key]!,
              root,
            ) as Record<string, Json>;
          const header = ["body", "0"];
          const headerLine = map(0, 0).line;
          for (const path of [
            [],
            header,
            [...header, "func"],
            [...header, "func", "body"],
            [...header, "name"],
          ]) {
            for (const value of [left, right]) {
              const object = at(value, path);
              const location = String(object["location"]).split(" - ");
              if (path.at(-1) === "name") object["location"] = "<wrapper name>";
              else
                object["location"] =
                  `${location[0]!.startsWith(`${headerLine},`) ? "<wrapper begin>" : location[0]} - ${flow.syntheticEnd ? "<wrapper end>" : location[1]}`;
            }
          }
        }
        return difference(left, right);
      };
      if (input.luau !== undefined) {
        const run = ours.prelude.root.body.find(
          (s) =>
            s instanceof AstStatFunction &&
            s.name instanceof AstExprGlobal &&
            s.name.name === "run",
        );
        const offset = input.text
          .split("\n")
          .findIndex((line) => line === "function run()");
        const unit: LuauTextUnit = {
          kind: "file",
          text: input.luau,
          lines: input.luau
            .split("\n")
            .map(
              (_, i, lines) =>
                i + offset + (i === 0 ? 0 : i >= lines.length - 2 ? 2 : 1),
            ),
        };
        return compare(
          input.luau,
          run ?? ours.prelude.root,
          ours.prelude.errors.length,
          (line, column) =>
            textDocumentPosition(unit, new Position(line, column)),
          "_G",
          true,
        );
      }
      if (!input.name.includes("grammar/")) {
        const unit: LuauTextUnit = {
          kind: "file",
          text: input.text,
          lines: input.text.split("\n").map((_, i) => i),
        };
        // Compare the function containing the generated expression. The unit's
        // outer block has an artificial EOF where extraction drops whitespace.
        return compare(
          input.text,
          ours.prelude.root.body[0]!,
          ours.prelude.errors.length,
          (line, column) =>
            textDocumentPosition(unit, new Position(line, column)),
          "_G",
          true,
        );
      }
      const extracted = checkerTextUnits(
        tree,
        input.text,
        (parameters) =>
          parse(`local function __parameters${parameters} end`).errors === 0,
      );
      const units = [ours.prelude, ...ours.flows];
      const texts = [extracted.prelude, ...extracted.flows];
      if (units.length !== texts.length) return ["unit count differs"];
      return texts.flatMap((unit, i) =>
        compare(
          unit.text,
          units[i]!.root,
          units[i]!.errors.length,
          (line, column) =>
            textDocumentPosition(unit, new Position(line, column)),
          extracted.anyName,
          false,
          unit.kind === "flow" ? unit : undefined,
        ).map((d) => `${unit.kind} ${i}: ${d}`),
      );
    }
    function assertInput(input: LuauInput, key = input.name) {
      const differences = fixtureDifferences(input);
      const unsupported = UNSUPPORTED_INTEGER_INPUTS.find((entry) => entry.fixture === key);
      if (unsupported) {
        // Retain the precise intentional divergence, not any AST mismatch:
        // official Luau accepts this file, the converter has syntax errors,
        // and the compiler reports the unsupported integer literal diagnostic.
        expect(input.luau, unsupported.reason).toBeDefined();
        expect(parse(input.luau!).errors, unsupported.reason).toBe(0);
        expect(differences, unsupported.reason).toEqual([
          expect.stringMatching(/^syntax errors: official 0, converter [1-9][0-9]*$/),
        ]);
        const errors = diagnoseDetailed(input.text).filter((d) => d.severity === 1);
        expect(errors.some((d) => d.message === unsupported.limitation!.diagnostic), unsupported.reason).toBe(true);
        expect(errors.filter((d) => d.message === "Malformed number")).toEqual([]);
        return;
      }
      const known = KNOWN.find((d) => d.input === key);
      if (known)
        expect(
          differences.length,
          `${key} agrees now; remove #${known.issue} from KNOWN`,
        ).toBeGreaterThan(0);
      else
        expect(differences, `${input.name}: ${differences.join("; ")}`).toEqual(
          [],
        );
    }
    test("official module parses and reports syntax errors", () => {
      expect(parse("local x = 1").errors).toBe(0);
      expect(parse("local =").errors).toBeGreaterThan(0);
      // Keep the exemption names visible in failure evidence.
      expect(parse("local x = 1").root, EXEMPTIONS.join("; ")).not.toBeNull();
    });
    test("the full pinned corpus and every known disagreement are still present", () => {
      const inputs = luauInputs();
      expect(
        inputs.filter((input) => input.name.startsWith("conformance/")).length,
      ).toBe(54);
      expect(inputs.some((input) => input.name.startsWith("grammar/"))).toBe(
        true,
      );
      const names = new Set([
        ...inputs.map((input) => input.name),
        ...generatedExpressions().map((input) => input.expression),
      ]);
      expect(KNOWN.filter((input) => !names.has(input.input))).toEqual([]);
      expect(new Set(KNOWN.map((input) => input.input)).size).toBe(
        KNOWN.length,
      );
      expect(UNSUPPORTED_INTEGER_INPUTS.map((entry) => entry.fixture)).toEqual([
        "conformance/integers.luau",
        "conformance/integers_regspill.luau",
      ]);
      expect(UNSUPPORTED_INTEGER_INPUTS.filter((entry) => !names.has(entry.fixture))).toEqual([]);
      expect(KNOWN.filter((entry) => UNSUPPORTED_INTEGER_INPUTS.some((integer) => integer.fixture === entry.input))).toEqual([]);
    });
    test("comparison rejects location, node kind, array shape and child changes", () => {
      const original = parse("local x = 1 + 2").root;
      for (const key of ["location", "type", "body"]) {
        const changed = structuredClone(original) as Record<string, Json>;
        changed[key] = key === "body" ? [] : "changed";
        expect(difference(original, changed).length, key).toBeGreaterThan(0);
      }
      expect(difference([], {})).not.toEqual([]);
    });
    test("an array type's implicit number key uses the element type's location", () => {
      assertInput({
        name: "array type position",
        text: "function f(x: {string}) end",
      });
    });
    test("Sparkdown rewrites keep real positions while exempting synthesized spans", () => {
      assertInput({
        name: "grammar/substitution-positions",
        text: "scene one(k: number)\n  & x = @/hello/gi\n  branch inner(m, w: string)\n    & x = m\n  end\nend\n",
      });
      assertInput({
        name: "grammar/synthetic-parameters",
        text: "function greet\n  local x = 1\nend\n",
      });
    });
    test("real flow closers retain their end-position assertion with trailing comments", () => {
      for (const ending of ["end", "end -- comment", "  end --[[ comment ]] "]) {
        const input = {
          name: "grammar/real-flow-closer",
          text: `scene one\n  & x = 1\n${ending}\n`,
        };
        expect(fixtureDifferences(input), ending).toEqual([]);
        const changed = fixtureDifferences(input, (units) => {
          expect(units.flows).toHaveLength(1);
          const root = units.flows[0]!.root;
          root.location = new Location(root.location.begin, new Position(99, 99));
        });
        expect(changed.join("; "), ending).toContain("99,99");
      }
    });
    for (const input of luauInputs())
      test(input.name, () => assertInput(input), 120_000);
    const groups = new Map<string, string[]>();
    for (const { group, expression } of generatedExpressions())
      groups.set(group, [...(groups.get(group) ?? []), expression]);
    for (const [group, expressions] of groups)
      test(`generated ${group}`, () => {
        const failures: string[] = [];
        for (const expression of expressions) {
          try {
            assertInput(
              {
                name: expression,
                text: expressionDocument(expression),
                luau: undefined,
              },
              expression,
            );
          } catch (error) {
            failures.push(`${expression}: ${String(error)}`);
          }
        }
        expect(failures).toEqual([]);
      }, 120_000);
  },
);
