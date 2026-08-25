import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";

export const getDeclarationScopes = (
  read: (from: number, to: number) => string,
  scriptAnnotations: Map<string, SparkdownAnnotations>,
) => {
  let scopePathParts: {
    kind: "" | "function" | "scene" | "branch";
    name: string;
  }[] = [];
  const scopes: {
    [path: string]: Record<string, string[]>;
  } = {};
  for (const [, annotations] of scriptAnnotations) {
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        if (cur.value.type === "scene") {
          scopePathParts = [];
          scopePathParts.push({ kind: "scene", name: text });
        }
        if (cur.value.type === "branch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind !== "scene") {
            scopePathParts.pop();
          }
          const scopePath = scopePathParts.map((p) => p.name).join(".");
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
          scopePathParts.push({ kind: "branch", name: text });
        }
        if (
          cur.value.type === "function" ||
          cur.value.type === "scene" ||
          cur.value.type === "const" ||
          cur.value.type === "var"
        ) {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(read(cur.from, cur.to));
        }
        if (cur.value.type === "define") {
          // Global
          const scopePath = "";
          scopes[scopePath] ??= {};
          scopes[scopePath][cur.value.type] ??= [];
          scopes[scopePath][cur.value.type]!.push(
            read(cur.from, cur.to).trim().replaceAll(/[ ]+/, "."),
          );
        }
        if (cur.value.type === "label" || cur.value.type === "param") {
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
