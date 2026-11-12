import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type SyntaxNode } from "@lezer/common";
import { DocumentHighlight, DocumentHighlightKind, Location, type Range } from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { referenceBindings } from "../annotations/referenceBindings";
import { resolveDivertPath } from "../annotations/resolveDivertPath";
import { resolveSymbolId } from "../annotations/resolveSymbolId";
import { getFileSymbol } from "./getFileSymbol";
import { linkedTypes, walkReferences } from "./getReferences";
import { getScriptReferences, type ScriptReference } from "./getScriptReferences";

export type AssetUseRole = "backdrop" | "portrait" | "sound" | "music" | "font" | "other";

export type AssetUse = Location & DocumentHighlight & { role: AssetUseRole; text: string };

export interface AssetUsage {
  version: number | undefined;
  uses: Record<string, AssetUse[]>;
  scripts: ScriptReference[];
}

const lineText = (document: { getText: (range?: Range) => string }, line: number) =>
  document.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } }).replace(/[\r\n]+$/, "");

const COMMANDS =new Set(["ImageCommand", "AudioCommand"]);

const commandOf = (node: SyntaxNode | null): SyntaxNode | null => {
  for (let at = node; at; at = at.parent) {
    if (COMMANDS.has(at.name)) {
      return at;
    }
  }
  return null;
};

const targetOf = (command: SyntaxNode): SyntaxNode | null => {
  const cursor = command.cursor();
  while (cursor.next() && cursor.from < command.to) {
    if (cursor.name === "AssetCommandTarget") {
      return cursor.node;
    }
  }
  return null;
};

const roleOf = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  uri: string,
  from: number,
  type: string,
): AssetUseRole => {
  if (type === "font") {
    return "font";
  }
  if (type !== "image" && type !== "audio") {
    return "other";
  }
  const command = commandOf(workspace.tree(uri)?.resolveInner(from, 1) ?? null);
  const expected = type === "image" ? "ImageCommand" : "AudioCommand";
  if (command?.name !== expected) {
    return "other";
  }
  const target = targetOf(command);
  const fallbacks = program?.context?.["config"]?.["interpreter"]?.["fallbacks"];
  const place = String(
    (target ? workspace.document(uri)?.read(target.from, target.to) : undefined) ??
      (type === "image" ? fallbacks?.layer : fallbacks?.channel) ??
      "",
  ).trim();
  if (type === "audio") {
    return place === "music" ? "music" : "sound";
  }
  return place === "backdrop" || place === "background" ? "backdrop" : place === "portrait" ? "portrait" : "other";
};

type Target = { uri: string; type: string };

const ASSET_KINDS: Record<string, string> = {
  image: "image",
  layered_image: "image",
  filtered_image: "image",
  graphic: "image",
  audio: "audio",
  layered_audio: "audio",
  synth: "audio",
  video: "video",
  font: "font",
};

const assetKindOf = (type: string) => ASSET_KINDS[type] ?? "other";

const REFERENCE_DEPTH = 4;

const backingFiles = (
  program: SparkProgram | undefined,
  assets: ReadonlySet<string>,
): { type: string; name: string; uris: ReadonlySet<string> }[] => {
  const context = program?.context as Record<string, Record<string, unknown>> | undefined;
  if (!context || !assets.size) {
    return [];
  }
  const memo = new Map<string, Set<string>>();
  const filesOf = (type: string, name: string): Set<string> => {
    const id = `${type}.${name}`;
    const known = memo.get(id);
    if (known) {
      return known;
    }
    const files = new Set<string>();
    memo.set(id, files);
    const definition = context[type]?.[name];
    const visit = (value: unknown, depth: number) => {
      if (!value || typeof value !== "object" || depth > REFERENCE_DEPTH) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      const record = value as Record<string, unknown>;
      if (depth > 0 && typeof record["$type"] === "string" && typeof record["$name"] === "string") {
        filesOf(record["$type"], record["$name"]).forEach((uri) => files.add(uri));
        return;
      }
      for (const [key, child] of Object.entries(record)) {
        if (key !== "$default") {
          visit(child, depth + 1);
        }
      }
    };
    if (definition && typeof definition === "object") {
      const uri = (definition as Record<string, unknown>)["uri"];
      if (typeof uri === "string" && assets.has(uri)) {
        files.add(uri);
      }
      visit(definition, 0);
    }
    return files;
  };
  const backed: { type: string; name: string; uris: ReadonlySet<string> }[] = [];
  for (const [type, definitions] of Object.entries(context)) {
    if (!definitions || typeof definitions !== "object" || !(type in ASSET_KINDS)) {
      continue;
    }
    for (const name of Object.keys(definitions)) {
      if (name.startsWith("$")) {
        continue;
      }
      const uris = filesOf(type, name);
      if (uris.size) {
        backed.push({ type, name, uris });
      }
    }
  }
  return backed;
};

export const getAssetUses = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  assetUris: Iterable<string>,
): Record<string, AssetUse[]> => {
  const direct = new Map<string, Map<string, Target>>();
  const linked = new Map<string, Map<string, Target>>();
  const links = new Map<string, string[]>();
  const result: Record<string, AssetUse[]> = {};
  const add = (map: typeof direct, id: string, target: Target) => {
    const targets = map.get(id) ?? new Map<string, Target>();
    targets.set(target.uri, target);
    map.set(id, targets);
  };
  const linkedTo = (type: string) => {
    let types = links.get(type);
    if (!types) {
      types = linkedTypes(program, type);
      links.set(type, types);
    }
    return types;
  };
  const index = (type: string, name: string, target: Target) => {
    result[target.uri] ??= [];
    add(direct, `${type}.${name}`, target);
    for (const linkedType of linkedTo(type)) {
      add(linked, `${linkedType}.${name}`, target);
    }
  };
  const assets = new Set(assetUris);
  for (const uri of assets) {
    const symbol = getFileSymbol(workspace, uri);
    if (symbol) {
      index(symbol.type, symbol.name, { uri, type: symbol.type });
    }
  }
  for (const { type, name, uris } of backingFiles(program, assets)) {
    for (const uri of uris) {
      index(type, name, { uri, type: getFileSymbol(workspace, uri)?.type ?? assetKindOf(type) });
    }
  }
  if (!direct.size) {
    return result;
  }
  const bindingAt = referenceBindings(workspace);
  for (const scriptUri of workspace.uris()) {
    const document = workspace.document(scriptUri);
    if (!document) {
      continue;
    }
    const found = new Map<string, Set<number>>();
    walkReferences(workspace, scriptUri, (r, scopePath) => {
      const reference = r.value?.type;
      if (!reference) {
        return;
      }
      let unbound: boolean | undefined;
      const hit = (target: Target) => {
        unbound ??= bindingAt(scriptUri, r.from, reference) === undefined;
        if (!unbound) {
          return;
        }
        const seen = found.get(target.uri) ?? new Set<number>();
        found.set(target.uri, seen);
        if (seen.has(r.from)) {
          return;
        }
        seen.add(r.from);
        const range = document.range(r.from, r.to);
        result[target.uri]!.push({
          uri: scriptUri,
          range,
          text: lineText(document, range.start.line),
          kind:
            reference.kind === "write"
              ? DocumentHighlightKind.Write
              : reference.kind === "read"
                ? DocumentHighlightKind.Read
                : DocumentHighlightKind.Text,
          role: roleOf(workspace, program, scriptUri, r.from, target.type),
        });
      };
      for (const refId of reference.symbolIds ?? []) {
        const resolved = resolveSymbolId(refId, reference, scopePath, program, workspace.compilerConfig);
        const id = resolved && reference.usage === "divert" ? resolveDivertPath(resolved, scopePath) : resolved;
        if (!id) {
          continue;
        }
        if (reference.linkable) {
          for (const target of linked.get(id)?.values() ?? []) {
            hit(target);
          }
        }
        for (const target of direct.get(id)?.values() ?? []) {
          hit(target);
        }
      }
    });
  }
  return result;
};

export const getAssetUsage = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  mainUri: string,
): AssetUsage | null => {
  if (!program) {
    return null;
  }
  const uris = [...workspace.fileUris()].filter(
    (uri) => uri !== mainUri && workspace.getMainScriptUri(uri) === mainUri,
  );
  return {
    version: program.version,
    uses: getAssetUses(workspace, program, uris),
    scripts: getScriptReferences(workspace, program),
  };
};

export const getFileReferences = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  uri: string,
): { references: AssetUse[] } | null => {
  const uses = getAssetUses(workspace, program, [uri])[uri];
  return uses ? { references: uses } : null;
};
