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

const CHARACTER_TEXT: ReadonlySet<Reference["declaration"]> = new Set([
  "character_name",
  "character_alias",
]);

const DECLARED_NAME: ReadonlySet<DeclarationType> = new Set([
  "scene",
  "function",
  "var",
  "const",
  "define",
]);

const MAX_NAMINGS = 50;

type Scripts = Pick<SparkdownLanguageServerWorkspace, "document" | "annotations" | "tree">;

type Site = { uri: string; from: number; to: number; name: string; raw: string };

const storyWideDeclarations = (scripts: Scripts, uri: string): Site[] => {
  const found: Site[] = [];
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
      !document ||
      !reference ||
      reference.root != null ||
      bindingAt(uri, r.from, reference) !== undefined
    ) {
      return;
    }
    const raw = document.read(r.from, r.to);
    if (names.has(r.from) && STORY_WIDE.has(reference.declaration)) {
      found.push({ uri, from: r.from, to: r.to, name: raw, raw });
    } else if (CHARACTER_TEXT.has(reference.declaration)) {
      const id = reference.symbolIds?.[0];
      const name = id?.slice(id.indexOf("=") + 1);
      if (name) {
        found.push({ uri, from: r.from, to: r.to, name, raw });
      }
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
  const declared = uris.flatMap((uri) => storyWideDeclarations(view, uri));
  const declaredAt = new Map(declared.map((site) => [`${site.uri}\n${site.from}`, site]));
  for (const { name } of declared) {
    taken.add(name);
  }

  const sites = new Map<string, Site>();
  for (const declaration of declared) {
    const document = view.document(declaration.uri)!;
    const { references } = getReferences(
      document,
      view.tree(declaration.uri),
      program,
      view,
      document.positionAt(declaration.from),
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
      const from = target.offsetAt(reference.range.start);
      const to = target.offsetAt(reference.range.end);
      const key = `${reference.uri}\n${from}`;
      const raw = target.read(from, to);
      const site = declaredAt.get(key);
      if (site?.name === declaration.name || raw === declaration.name) {
        sites.set(key, { uri: reference.uri, from, to, name: declaration.name, raw });
      }
    }
  }

  const render = (renamed: ReadonlyMap<string, string>) =>
    files.map(({ uri, text }) => {
      const inFile = [...sites.values()]
        .filter((site) => site.uri === uri)
        .sort((a, b) => a.from - b.from);
      let result = "";
      let at = 0;
      const moved: { from: number; name: string }[] = [];
      for (const site of inFile) {
        const replacement = site.raw + renamed.get(site.name)!.slice(site.name.length);
        result += text.slice(at, site.from);
        moved.push({ from: result.length, name: site.name });
        result += replacement;
        at = site.to;
      }
      return { uri, text: result + text.slice(at), moved };
    });

  const captured = (rendered: ReturnType<typeof render>) => {
    const reparsed = new SparkdownDocumentRegistry([]);
    for (const { uri, text } of rendered) {
      reparsed.add({ textDocument: { uri, languageId: "sparkdown", version: 0, text } });
    }
    const bindingAt = referenceBindings({
      tree: (uri: string) => reparsed.tree(uri),
      document: (uri: string) => reparsed.get(uri),
    } as Scripts);
    const names = new Set<string>();
    for (const { uri, moved } of rendered) {
      for (const { from, name } of moved) {
        if (bindingAt(uri, from, undefined) !== undefined) {
          names.add(name);
        }
      }
    }
    return names;
  };

  const blocked = new Set(taken);
  let rendered: ReturnType<typeof render> = [];
  for (let naming = 0; naming < MAX_NAMINGS; naming += 1) {
    const used = new Set(blocked);
    const renamed = new Map<string, string>();
    for (const { name } of declared) {
      if (!renamed.has(name)) {
        let candidate = name + suffix;
        for (let n = 2; used.has(candidate); n += 1) {
          candidate = `${name}${suffix}_${n}`;
        }
        used.add(candidate);
        renamed.set(name, candidate);
      }
    }
    rendered = render(renamed);
    const capturing = captured(rendered);
    if (capturing.size === 0) {
      break;
    }
    for (const name of capturing) {
      blocked.add(renamed.get(name)!);
    }
  }
  return rendered.map(({ text }) => text);
};
