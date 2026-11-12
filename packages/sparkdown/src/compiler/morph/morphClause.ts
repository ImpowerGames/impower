import type { Tree } from "@lezer/common";

export interface MorphClause {
  directive: { from: number; to: number };
  keyword: { from: number; to: number };
  value?: { from: number; to: number; text: string };
}

const CLAUSE_VALUE = /^[^\S\r\n]+([^\s\]]+)/;

export function findMorphClauses(tree: Tree, read: (from: number, to: number) => string): MorphClause[] {
  const clauses: MorphClause[] = [];
  let directive: { from: number; to: number } | undefined;
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "ImageCommand") {
        directive = { from: ref.from, to: ref.to };
        return undefined;
      }
      if (!directive || ref.from >= directive.to || ref.name !== "AssetCommandClauseKeyword") return undefined;
      if (read(ref.from, ref.to) !== "morph") return false;
      const clause: MorphClause = { directive, keyword: { from: ref.from, to: ref.to } };
      const match = CLAUSE_VALUE.exec(read(ref.to, directive.to));
      if (match) {
        const from = ref.to + match[0].length - match[1]!.length;
        clause.value = { from, to: from + match[1]!.length, text: match[1]! };
      }
      clauses.push(clause);
      return false;
    },
  });
  return clauses;
}

export function morphClauseAt(clauses: readonly MorphClause[], offset: number): MorphClause | undefined {
  return clauses.find((clause) => clause.directive.from <= offset && offset < clause.directive.to);
}
