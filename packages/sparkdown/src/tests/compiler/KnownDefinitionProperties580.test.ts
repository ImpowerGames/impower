import { describe, expect, test } from "vitest";
import type { DefinitionPropertyMetadata } from "../../compiler/types/DefinitionPropertyMetadata";
import { getKnownDefinitionProperties } from "../../compiler/utils/knownDefinitionProperties";

const property = (path: (string | number)[], declared = false, value?: unknown) => ({
  path, declared, value, key: { from: 0, to: 1 },
});

describe("known definition properties (#580)", () => {
  test("unions default, optional and named optional shapes at nested paths and list items", () => {
    const registry = { context: { animation: {
      $default: { timing: { duration: 0 }, keyframes: [] },
      $optional: { timing: { delay: 0 }, keyframes: [{ opacity: "" }] },
      "$optional:fade": { timing: { custom: 1 } },
    } } };
    expect([...getKnownDefinitionProperties(registry, "animation", "fade", ["timing"]).properties.keys()])
      .toEqual(["custom", "delay", "duration"]);
    expect([...getKnownDefinitionProperties(registry, "animation", "fade", ["keyframes", 7]).properties.keys()])
      .toEqual(["opacity"]);
    expect(getKnownDefinitionProperties(registry, "animation", "fade", ["missing"]).described).toBe(false);
  });

  test("an unmarked unknown key on a parent never becomes a descendant declaration", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "Bird", name: "robin", root: false, definesType: true, parent: { type: "Bird", name: "$default" },
      properties: [property(["nickname"], true, "Rob"), property(["typo"], false, 1)], openPaths: [],
    }];
    const registry = { context: { Bird: {
      $default: { name: "" }, robin: { name: "Robin", nickname: "Rob", typo: 1 },
    } }, definitions };
    const known = getKnownDefinitionProperties(registry, "robin", "child");
    expect([...known.properties.keys()]).toEqual(["nickname", "name"]);
    expect(known.properties.get("nickname")?.declaredBy).toBe("robin");
    expect(known.properties.has("typo")).toBe(false);
  });

  test("validation can exclude the current definition's declarations", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "Bird", name: "robin", root: false,
      properties: [property(["nickname"], true)], openPaths: [[]],
    }];
    expect(getKnownDefinitionProperties({ definitions }, "Bird", "robin").properties.has("nickname")).toBe(true);
    expect(getKnownDefinitionProperties({ definitions }, "Bird", "robin", [], { includeOwnDeclarations: false })
      .properties.has("nickname")).toBe(false);
    expect(getKnownDefinitionProperties({ definitions }, "Bird", "robin", [], { includeOwnDeclarations: false })
      .open).toBe(true);
  });

  test("a declared block describes its contents and an open level stays local", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "config", name: "ui", root: false, definesType: true,
      properties: [property(["breakpoints"], true), {
        ...property(["breakpoints", "xs"], false, 400), declaredByBlock: true,
      }], openPaths: [["breakpoints"]],
    }];
    const registry = { definitions };
    const nested = getKnownDefinitionProperties(registry, "ui", "mobile", ["breakpoints"]);
    expect(nested.open).toBe(true);
    expect([...nested.properties.keys()]).toEqual(["xs"]);
    expect(getKnownDefinitionProperties(registry, "ui", "mobile").open).toBe(false);
  });

  test("root properties are declarations even when their values are dynamic", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "Bird", name: "$default", root: true,
      properties: [property(["flight"], false)], openPaths: [[]],
    }];
    const known = getKnownDefinitionProperties({ definitions }, "Bird", "robin");
    expect(known.open).toBe(true);
    expect(known.properties.has("flight")).toBe(true);
  });

  test("a structural instance does not introduce an OOP parent type", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "animation", name: "fade", root: false,
      parent: { type: "animation", name: "$default" },
      properties: [property(["extra"], true)], openPaths: [],
    }];
    expect(getKnownDefinitionProperties({ definitions }, "fade", "child").described).toBe(false);
    expect(getKnownDefinitionProperties({ definitions }, "animation", "fade").properties.has("extra")).toBe(true);
  });

  test("recursive types skip validation and cyclic ancestor metadata terminates", () => {
    const definitions: DefinitionPropertyMetadata[] = [{
      type: "style", name: "one", root: false, parent: { type: "style", name: "two" },
      properties: [], openPaths: [],
    }, {
      type: "style", name: "two", root: false, parent: { type: "style", name: "one" },
      properties: [], openPaths: [],
    }];
    expect(getKnownDefinitionProperties({ context: { style: { $default: { $recursive: true } } }, definitions },
      "style", "one").recursive).toBe(true);
  });
});
