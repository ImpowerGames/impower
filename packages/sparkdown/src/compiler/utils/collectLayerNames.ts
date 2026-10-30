import type { SparkProgram } from "../types/SparkProgram";

const MAX_DEPTH = 32;

const IMPLICIT_ELEMENT_NAMES = ["foldout_label"];

export const collectLayerNames = (program: SparkProgram): Set<string> => {
  const names = new Set<string>(IMPLICIT_ELEMENT_NAMES);
  const seenStructs = new WeakSet<object>();
  const seenNodes = new WeakSet<object>();
  const componentNames = new Set(
    Object.keys(program.sparkle?.components ?? {}),
  );

  const addName = (key: string) => {
    for (const segment of key.split(".")) {
      for (const token of segment.split(" ")) {
        if (token && !token.startsWith("$")) {
          names.add(token);
        }
      }
    }
  };

  const walkStruct = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (depth > MAX_DEPTH || seenStructs.has(value)) {
      return;
    }
    seenStructs.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        walkStruct(item, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) {
        continue;
      }
      addName(key);
      walkStruct(child, depth + 1);
    }
  };

  const walkAst = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (depth > MAX_DEPTH || seenNodes.has(value)) {
      return;
    }
    seenNodes.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, depth + 1);
      }
      return;
    }
    const node = value as { kind?: string; tag?: string; classes?: string[] };
    if (node.kind === "element") {
      if (typeof node.tag === "string" && !componentNames.has(node.tag)) {
        addName(node.tag);
      }
      for (const cls of node.classes ?? []) {
        addName(cls);
      }
    }
    for (const child of Object.values(value)) {
      walkAst(child, depth + 1);
    }
  };

  const layouts = program.context?.["layout"];
  if (layouts && typeof layouts === "object") {
    for (const [name, struct] of Object.entries(layouts)) {
      addName(name);
      walkStruct(struct, 0);
    }
  }
  const components = program.context?.["component"];
  if (components && typeof components === "object") {
    for (const struct of Object.values(components)) {
      walkStruct(struct, 0);
    }
  }
  walkAst(program.sparkle?.layouts, 0);
  walkAst(program.sparkle?.components, 0);

  const ui = (program.context?.["config"] as any)?.["ui"];
  for (const key of ["layouts_element_name", "styles_element_name"]) {
    const name = ui?.[key];
    if (typeof name === "string" && name) {
      addName(name);
    }
  }

  return names;
};
