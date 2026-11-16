import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { test } from "vitest";
import { type CompletionItem } from "vscode-languageserver";
import { getCompletions } from "../../utils/providers/getCompletions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";

const URI = "file:///proj/main.sd";

const MARKER = /@(\d)/g;

export interface CompletionAt {
  items: CompletionItem[];
  labels: string[];
  detail(label: string): string | undefined;
  resolve(label: string): Promise<CompletionItem | undefined>;
}

export interface CompleteOptions {
  at?: string;
  program?: SparkProgram;
  trigger?: string;
  editedFrom?: string;
}

const singleChange = (before: string, after: string) => {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  return { start, end: before.length - end, text: after.slice(start, after.length - end) };
};

export function complete(
  source: string,
  options: CompleteOptions = {},
): CompletionAt {
  const markers = new Map<string, number>();
  let text = "";
  let last = 0;
  for (const match of source.matchAll(MARKER)) {
    text += source.slice(last, match.index);
    markers.set(match[1]!, text.length);
    last = match.index! + match[0].length;
  }
  text += source.slice(last);
  const at = options.at ?? (markers.size === 1 ? [...markers.keys()][0] : undefined);
  const offset = at == null ? undefined : markers.get(at);
  if (offset == null) {
    throw new Error(`no cursor marker @${at ?? "?"} in the source`);
  }
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  if (options.editedFrom == null) {
    documents.set({
      textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
    });
  } else {
    const before = options.editedFrom;
    documents.set({
      textDocument: { uri: URI, text: before, version: 1, languageId: "sparkdown" },
    });
    documents.tree(URI);
    documents.annotations(URI);
    const opened = documents.get(URI)!;
    const change = singleChange(before, text);
    documents.update({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: { start: opened.positionAt(change.start), end: opened.positionAt(change.end) },
          text: change.text,
        },
      ],
    });
  }
  const document = documents.get(URI)!;
  if (document.getText() !== text) {
    throw new Error("the document does not hold the marked text");
  }
  const returned = getCompletions(
    document,
    documents.tree(URI),
    new Map([[URI, { annotations: documents.annotations(URI), tree: documents.tree(URI), read: (from: number, to: number) => documents.get(URI)!.read(from, to) }]]),
    options.program,
    undefined,
    document.positionAt(offset),
    options.trigger
      ? { triggerKind: 2, triggerCharacter: options.trigger }
      : undefined,
  );
  const items = returned ?? [];
  const item = (label: string) => items.find((i) => i.label === label);
  return {
    items,
    labels: items.map((i) => String(i.label)),
    detail: (label) => item(label)?.labelDetails?.description,
    resolve: async (label) => {
      const found = item(label);
      return found ? resolveCompletion(found, options.program) : undefined;
    },
  };
}

export const labelsAt = (source: string, options?: CompleteOptions) =>
  complete(source, options).labels;

export interface ProjectAsset {
  name: string;
  ext: string;
  type: "image" | "audio";
}

export function compileProject(
  script: string,
  assets: ProjectAsset[] = [],
): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: script,
        version: 1,
        languageId: "sparkdown",
      },
      ...assets.map((asset) => ({
        uri: `file:///proj/${asset.name}.${asset.ext}`,
        type: asset.type,
        name: asset.name,
        ext: asset.ext,
        src: `/proj/${asset.name}.${asset.ext}`,
        version: 1,
      })),
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never).program;
}

type Body = () => void | Promise<void>;

const knownBug = (title: string, body: Body) => {
  const mode = process.env["SPARKDOWN_KNOWN_COMPLETION_BUGS"];
  if (mode === "fails") test.fails(title, body);
  else if (mode === "run") test(title, body);
  else test.skip(title, body);
};

export function upstreamCase(key: string, title: string, body: Body) {
  test(`${key}: ${title}`, body);
}

const bugTag = (bugs: number | number[]) =>
  `(${[bugs].flat().map((bug) => `Bug #${bug}`).join(", ")})`;

upstreamCase.bug = (
  bugs: number | number[],
  key: string,
  title: string,
  body: Body,
) => {
  knownBug(`${key}: ${title} ${bugTag(bugs)}`, body);
};

export function sparkdownBug(bugs: number | number[], title: string, body: Body) {
  knownBug(`${title} ${bugTag(bugs)}`, body);
}
