import type { SparkProgram } from "../types/SparkProgram";

const WRITE_CONTENT_TAGS: ReadonlySet<string> = new Set(["text", "image", "stroke", "mask"]);

export interface LayoutElementNames {
  named: Set<string>;
  classed: Map<string, string>;
  content: Set<string>;
}

export const layoutElementNames = (program: SparkProgram | undefined): LayoutElementNames => {
  const named = new Set<string>();
  const classed = new Map<string, string>();
  const content = new Set<string>();
  const add = (name: string) => {
    (WRITE_CONTENT_TAGS.has(name) ? content : named).add(name);
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node["kind"] === "element") {
      for (const key of ["tag", "name"]) {
        const name = node[key];
        if (typeof name === "string") add(name);
      }
      const classes = node["classes"];
      if (Array.isArray(classes)) {
        for (const c of classes) {
          if (typeof c === "string" && !classed.has(c)) classed.set(c, `${node["tag"]}.${classes.join(".")}`);
        }
      }
    }
    for (const v of Object.values(node)) {
      if (v !== null && typeof v === "object") visit(v);
    }
  };
  for (const kind of ["layouts", "screens", "components"] as const) {
    visit(Object.values(program?.sparkle?.[kind] ?? {}));
  }
  for (const struct of Object.values(program?.context?.["layout"] ?? {})) {
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, v] of Object.entries(value)) {
        const [name] = key.split(" ");
        if (name) add(name);
        walk(v);
      }
    };
    walk(struct);
  }
  return { named, classed, content };
};

export const layoutNames = (program: SparkProgram | undefined): Set<string> =>
  new Set(
    [...Object.keys(program?.sparkle?.layouts ?? {}), ...Object.keys(program?.context?.["layout"] ?? {})].filter(
      (name) => !name.startsWith("$"),
    ),
  );

export const showingNames = (program: SparkProgram | undefined): Set<string> => {
  const { named, content } = layoutElementNames(program);
  return new Set([...layoutNames(program), ...named, ...content].filter((name) => !name.startsWith("$")));
};
