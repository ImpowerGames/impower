/* eslint-disable no-template-curly-in-string */
import {
  completeFromList,
  Completion,
  CompletionContext,
  CompletionResult,
  snippetCompletion as snip,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode } from "@lezer/common";
import { FountainParseResult } from "../../impower-script-parser";

export const snippets: readonly Completion[] = [
  snip("var ${newVariable}", {
    label: "variable",
    type: "keyword",
  }),
  snip("image ${newImage}", {
    label: "image",
    type: "keyword",
  }),
  snip("audio ${newAudio}", {
    label: "audio",
    type: "keyword",
  }),
  snip("video ${newVideo}", {
    label: "video",
    type: "keyword",
  }),
  snip("text ${newText}", {
    label: "text",
    type: "keyword",
  }),
];

export const sectionSnippets = (level: number): Completion[] => {
  const result: Completion[] = [];
  for (let i = level + 1; i >= 0; i -= 1) {
    const operator = "#".repeat(i);
    const name = "NewSection";
    result.push(
      snip(`${operator} \${${name}}`, {
        label: `${operator} section`,
        type: "keyword",
      })
    );
  }
  return result;
};

export const variableSnippets = (names: string[]): Completion[] => {
  return Array.from(new Set(names)).map((x) =>
    snip(x, {
      label: x,
      type: "variable",
    })
  );
};

export const assetSnippets = (names: string[]): Completion[] => {
  return Array.from(new Set(names)).map((x) =>
    snip(x, {
      label: x,
      type: "function",
    })
  );
};

const getSectionInfo = (node: SyntaxNode): { level: number; from: number } => {
  const positions = new Set<number>();
  let from = 0;
  for (
    let cur: SyntaxNode | null = node;
    cur && cur.name !== "Document";
    cur = cur.parent
  ) {
    if (cur.name === "Section") {
      positions.add(cur.from);
      if (cur.from > from) {
        from = cur.from;
      }
    }
  }
  return { level: positions.size, from };
};

const isDialogue = (node: SyntaxNode): boolean => {
  for (
    let cur: SyntaxNode | null = node;
    cur && cur.name !== "Document";
    cur = cur.parent
  ) {
    if (cur.name === "Dialogue") {
      return true;
    }
  }
  return false;
};

export const autocomplete = (
  context: CompletionContext,
  parseContext: { result: FountainParseResult }
): CompletionResult | Promise<CompletionResult> => {
  const { result } = parseContext;
  const tree = syntaxTree(context.state);
  const node: SyntaxNode = tree.resolveInner(context.pos, -1);
  const input = context.state.sliceDoc(node.from, node.to);
  const sectionInfo = getSectionInfo(node);
  const sectionLevel = sectionInfo.level;
  const sectionFrom = sectionInfo.from;
  const sectionLineNumber = context.state.doc.lineAt(sectionFrom).number;
  const sectionId = result.sectionLines?.[sectionLineNumber];
  const section = result.sections?.[sectionId];
  const variables = {
    ...(section?.variables || {}),
    ...(result.sections?.[""]?.variables || {}),
  };
  const variableNames = Object.keys(variables).map((x) =>
    x.split(".").slice(-1).join(".")
  );
  const isLowercase = input.toLowerCase() === input;
  const completions: Completion[] = [];
  if (node.name === "Paragraph") {
    if (isLowercase) {
      completions.push(...snippets);
    }
    if (input.startsWith("#")) {
      completions.push(...sectionSnippets(sectionLevel));
    }
  }
  const variableNodeTypes = ["AssignName", "AssignValue", "DeclareValue"];
  if (variableNodeTypes.includes(node.name)) {
    completions.push(...variableSnippets(variableNames));
  }
  const assetNodeTypes = ["Note"];
  if (assetNodeTypes.includes(node.name)) {
    if (isDialogue(node)) {
      const type = "image";
      const assets = {
        ...(section?.assets?.[type] || {}),
        ...(result.sections?.[""]?.assets?.[type] || {}),
      };
      const assetNames = Object.entries(assets).map(([k]) =>
        k.split(".").slice(-1).join(".")
      );
      completions.push(...assetSnippets(assetNames));
    }
  }
  const source = completeFromList(completions);
  return source(context);
};
