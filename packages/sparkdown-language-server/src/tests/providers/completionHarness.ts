import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { test } from "vitest";
import { type CompletionItem } from "vscode-languageserver";
import { getCompletions } from "../../utils/providers/getCompletions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";

// A completion request at a marked cursor position, run through the language
// server's own provider the way `onCompletion` runs it: the document goes
// through the registry that parses and annotates it, and `getCompletions`
// receives the tree, the annotations and, when a case needs struct or asset
// names, a program compiled from a real project.
//
// A cursor is written as `@` followed by a digit, the marker convention of
// Luau's Autocomplete.test.cpp, so a ported snippet keeps its markers. Every
// marker is removed from the text and the request is made at the one named.
// Sparkdown's own `@` (write marks, Sparkle events) is never followed by a
// digit, so the two do not collide.

const URI = "file:///proj/main.sd";

const MARKER = /@(\d)/g;

export interface CompletionAt {
  /** The offered labels; none when the provider declined. */
  labels: string[];
  /** The highlighted item's detail: the description shown beside it. */
  detail(label: string): string | undefined;
  /** The highlighted item after `completionItem/resolve`. */
  resolve(label: string): Promise<CompletionItem | undefined>;
}

export interface CompleteOptions {
  /** Which `@N` marker is the cursor. Defaults to the only one. */
  at?: string;
  program?: SparkProgram;
  /**
   * The character that triggered the request, as the editor sends it when
   * the author types one of the server's trigger characters (`.`, `:`, …).
   */
  trigger?: string;
  /**
   * Text the document held before the request. The document is opened with
   * it and parsed, then brought to the marked text by one incremental
   * change, the way `textDocument/didChange` reaches the server while an
   * author types.
   */
  editedFrom?: string;
}

/** The one range change that turns `before` into `after`. */
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
    new Map([[URI, documents.annotations(URI)]]),
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
    labels: items.map((i) => String(i.label)),
    detail: (label) => item(label)?.labelDetails?.description,
    resolve: async (label) => {
      const found = item(label);
      return found ? resolveCompletion(found, options.program) : undefined;
    },
  };
}

/** The labels offered at the cursor. */
export const labelsAt = (source: string, options?: CompleteOptions) =>
  complete(source, options).labels;

export interface ProjectAsset {
  name: string;
  ext: string;
  type: "image" | "audio";
}

/**
 * Compiles `script` as the only script of a project that also holds `assets`,
 * with the builtins prelude, the way the workspace compiles an open project.
 * The program's `context` supplies the struct and asset names that the
 * provider completes from.
 */
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

// A known-bug case is skipped. SPARKDOWN_KNOWN_COMPLETION_BUGS=fails runs each
// one as `test.fails`, which passes only while the case still fails, so one
// run proves every skipped case reproduces its Bug and names any that a fix
// has since made pass. SPARKDOWN_KNOWN_COMPLETION_BUGS=run runs them as
// ordinary tests, to read the assertion each one fails on.
const knownBug = (title: string, body: Body) => {
  const mode = process.env["SPARKDOWN_KNOWN_COMPLETION_BUGS"];
  if (mode === "fails") test.fails(title, body);
  else if (mode === "run") test(title, body);
  else test.skip(title, body);
};

/**
 * Registers the sparkdown test for one upstream Autocomplete.test.cpp case.
 * `key` is the upstream case name as the manifest lists it (a name that
 * upstream uses twice carries `#2` on its second use); `title` says what the
 * sparkdown test checks. The manifest test reads these calls to prove every
 * ported and adapted case has a test.
 */
export function upstreamCase(key: string, title: string, body: Body) {
  test(`${key}: ${title}`, body);
}

const bugTag = (bugs: number | number[]) =>
  `(${[bugs].flat().map((bug) => `Bug #${bug}`).join(", ")})`;

/**
 * A case the port found failing, kept skipped until the named Bug is fixed.
 * A case that fails on more than one Bug names each, in the order they are
 * hit. Remove `.bug` (and the bug numbers) with the last fix.
 */
upstreamCase.bug = (
  bugs: number | number[],
  key: string,
  title: string,
  body: Body,
) => {
  knownBug(`${key}: ${title} ${bugTag(bugs)}`, body);
};

/** A sparkdown-only case that the port found failing, skipped under its Bug. */
export function sparkdownBug(bugs: number | number[], title: string, body: Body) {
  knownBug(`${title} ${bugTag(bugs)}`, body);
}
