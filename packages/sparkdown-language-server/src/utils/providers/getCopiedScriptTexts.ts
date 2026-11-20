import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type DeclarationType } from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { type Reference } from "@impower/sparkdown/src/compiler/classes/annotators/ReferenceAnnotator";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { referenceBindings } from "../annotations/referenceBindings";
import { getReferences, walkReferences } from "./getReferences";

const STORY_WIDE: ReadonlySet<Reference["declaration"]> = new Set([
  "scene",
  "function",
  "var",
  "const",
  "define_type_name",
  "define_variable_name",
]);

type Scripts = Pick<SparkdownLanguageServerWorkspace, "document" | "annotations" | "tree">;

const DECLARED_NAME: ReadonlySet<DeclarationType> = new Set([
  "scene",
  "function",
  "var",
  "const",
  "define",
]);

const storyWideDeclarations = (scripts: Scripts, uri: string) => {
  const found: { from: number; name: string }[] = [];
  const document = scripts.document(uri);
  const names = new Set<number>();
  const d = scripts.annotations(uri)?.declarations.iter();
  while (d?.value) {
    if (DECLARED_NAME.has(d.value.type)) {
      names.add(d.from);
    }
    d.next();
  }
  const bindingAt = referenceBindings(scripts);
  walkReferences(scripts, uri, (r) => {
    const reference = r.value?.type;
    if (
      document &&
      reference &&
      names.has(r.from) &&
      STORY_WIDE.has(reference.declaration) &&
      reference.root == null &&
      bindingAt(uri, r.from, reference) === undefined
    ) {
      found.push({ from: r.from, name: document.read(r.from, r.to) });
    }
  });
  return found;
};

export const getCopiedScriptTexts = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  files: readonly { uri: string; text: string }[],
  suffix: string,
): string[] => {
  const copies = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  for (const { uri, text } of files) {
    copies.add({ textDocument: { uri, languageId: "sparkdown", version: 0, text } });
  }
  const uris = files.map((file) => file.uri);
  const copied = new Set(uris);
  const view: SparkdownLanguageServerWorkspace = Object.assign(Object.create(workspace), {
    uris: () => uris,
    document: (uri: string) => (copied.has(uri) ? copies.get(uri) : undefined),
    tree: (uri: string) => (copied.has(uri) ? copies.tree(uri) : undefined),
    annotations: (uri: string) => (copied.has(uri) ? copies.annotations(uri) : undefined),
  });

  const taken = new Set<string>();
  for (const uri of workspace.uris()) {
    for (const { name } of storyWideDeclarations(workspace, uri)) {
      taken.add(name);
    }
  }
  const declared = uris.flatMap((uri) =>
    storyWideDeclarations(view, uri).map((declaration) => ({ uri, ...declaration })),
  );
  for (const { name } of declared) {
    taken.add(name);
  }
  const renamed = new Map<string, string>();
  for (const { name } of declared) {
    if (!renamed.has(name)) {
      let candidate = name + suffix;
      for (let n = 2; taken.has(candidate); n += 1) {
        candidate = `${name}${suffix}_${n}`;
      }
      taken.add(candidate);
      renamed.set(name, candidate);
    }
  }

  const edits = new Map<string, Map<number, { to: number; text: string }>>();
  for (const { uri, from, name } of declared) {
    const document = view.document(uri)!;
    const { references } = getReferences(
      document,
      view.tree(uri),
      program,
      view,
      document.positionAt(from),
      {
        includeDeclaration: true,
        searchOtherFiles: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    for (const reference of references ?? []) {
      const target = view.document(reference.uri);
      if (!target) {
        continue;
      }
      const start = target.offsetAt(reference.range.start);
      const end = target.offsetAt(reference.range.end);
      if (target.read(start, end) !== name) {
        continue;
      }
      let inFile = edits.get(reference.uri);
      if (!inFile) {
        inFile = new Map();
        edits.set(reference.uri, inFile);
      }
      inFile.set(start, { to: end, text: renamed.get(name)! });
    }
  }

  return files.map(({ uri, text }) => {
    const inFile = [...(edits.get(uri) ?? new Map<number, { to: number; text: string }>())].sort(
      ([a], [b]) => b - a,
    );
    let result = text;
    for (const [from, { to, text: replacement }] of inFile) {
      result = result.slice(0, from) + replacement + result.slice(to);
    }
    return result;
  });
};
