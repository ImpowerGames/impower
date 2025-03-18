import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export const getDeclarationScopes = (
  read: (from: number, to: number) => string,
  scriptAnnotations: Map<string, SparkdownAnnotations>
) => {
  let scopePathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [];
  const scopes: {
    [path: string]: Record<string, string[]>;
  } = {};
  for (const [, annotations] of scriptAnnotations) {
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        if (cur.value.type === "knot") {
          scopePathParts = [];
          scopePathParts.push({ kind: "knot", name: text });
        }
        if (cur.value.type === "stitch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind !== "knot") {
            scopePathParts.pop();
          }
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
          scopePathParts.push({ kind: "stitch", name: text });
        }
        if (
          cur.value.type === "knot" ||
          cur.value.type === "const" ||
          cur.value.type === "var" ||
          cur.value.type === "list" ||
          cur.value.type === "define"
        ) {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (
          cur.value.type === "label" ||
          cur.value.type === "temp" ||
          cur.value.type === "param"
        ) {
          // Local
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        cur.next();
      }
    }
  }
  return scopes;
};
