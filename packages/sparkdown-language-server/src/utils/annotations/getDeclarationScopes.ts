import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type DeclarationType } from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getLocalScope, getParameterScope } from "@impower/sparkdown/src/compiler/utils/localScopes";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import { getParentSectionPath } from "../syntax/getParentSectionPath";

export type DeclarationScopes = {
  [path: string]: Partial<Record<DeclarationType, string[]>>;
};

export type AnnotatedScript = {
  annotations: SparkdownAnnotations;
  tree: Tree | undefined;
  read: (from: number, to: number) => string;
};

export const getDeclarationScopes = (
  scripts: Map<string, AnnotatedScript>,
  cursor: { uri: string; offset: number },
): DeclarationScopes => {
  const scopes: DeclarationScopes = {};
  const visibleLocals = new Map<
    string,
    { type: DeclarationType; from: number; scopePath: string }
  >();
  const visibleSectionParameters = new Map<string, Set<string>>();
  const file = (scopePath: string, type: DeclarationType, name: string) => {
    scopes[scopePath] ??= {};
    scopes[scopePath][type] ??= [];
    scopes[scopePath][type]!.push(name);
  };
  for (const [uri, { annotations, tree, read }] of scripts) {
    let scopePathParts: {
      kind: "scene" | "branch";
      name: string;
    }[] = [];
    const inCursorScript = uri === cursor.uri;
    const cursorSection = inCursorScript && tree
      ? getParentSectionPath(getStack<SparkdownNodeName>(tree, cursor.offset, -1), read)
      : [];
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        const type = cur.value.type;
        const localScope =
          tree && (type === "var" || type === "function")
            ? getLocalScope(tree, cur.from, read, inCursorScript, type)
            : tree && type === "param"
              ? getParameterScope(tree, cur.from, read, inCursorScript)
              : undefined;
        if (localScope !== undefined) {
          if (
            localScope &&
            cursor.offset > localScope.from &&
            cursor.offset <= localScope.to
          ) {
            const previous = visibleLocals.get(text);
            if (!previous || localScope.from > previous.from) {
              visibleLocals.set(text, { type, from: localScope.from, scopePath: "" });
            }
          }
          cur.next();
          continue;
        }
        if (type === "scene") {
          scopePathParts = [];
          scopePathParts.push({ kind: "scene", name: text });
        }
        if (type === "end") {
          scopePathParts.pop();
        }
        if (type === "branch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind !== "scene") {
            scopePathParts.pop();
          }
          file(scopePathParts.map((p) => p.name).join("."), type, text);
          scopePathParts.push({ kind: "branch", name: text });
        }
        if (
          type === "function" ||
          type === "scene" ||
          type === "const" ||
          type === "var"
        ) {
          file("", type, text);
        }
        if (type === "define") {
          file("", type, text.trim().replaceAll(/[ ]+/g, "."));
        }
        if (type === "label" || type === "param") {
          const sectionParts = scopePathParts.map((p) => p.name);
          const scopePath = sectionParts.join(".");
          if (type === "param" && inCursorScript && sectionParts.length > 0 &&
              cur.to < cursor.offset &&
              sectionParts.every((part, index) => part === cursorSection[index])) {
            const parameters = visibleSectionParameters.get(scopePath) ?? new Set<string>();
            parameters.add(text);
            visibleSectionParameters.set(scopePath, parameters);
            const previous = visibleLocals.get(text);
            if (!previous || cur.to > previous.from) {
              visibleLocals.set(text, { type, from: cur.to, scopePath });
            }
          }
          file(scopePath, type, text);
        }
        cur.next();
      }
    }
  }
  const bindingTypes: DeclarationType[] = [
    "var",
    "param",
    "const",
    "function",
    "define",
  ];
  for (const [scopePath, scope] of Object.entries(scopes)) {
    for (const type of bindingTypes) {
      const names = scope[type];
      if (names) {
        scope[type] = names.filter((name) =>
          !visibleLocals.has(name) ||
          (type === "param" && scopePath !== "" &&
            !visibleSectionParameters.get(scopePath)?.has(name)),
        );
      }
    }
  }
  for (const [name, { type, scopePath }] of visibleLocals) {
    file(scopePath, type, name);
  }
  return scopes;
};
