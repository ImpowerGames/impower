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

export const getAssetUses = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  assetUris: Iterable<string>,
): Record<string, AssetUse[]> => {
  const direct = new Map<string, { uri: string; type: string }[]>();
  const linked = new Map<string, { uri: string; type: string }[]>();
  const links = new Map<string, string[]>();
  const result: Record<string, AssetUse[]> = {};
  const add = (map: typeof direct, id: string, target: { uri: string; type: string }) => {
    const list = map.get(id);
    if (list) list.push(target);
    else map.set(id, [target]);
  };
  for (const uri of assetUris) {
    const symbol = getFileSymbol(workspace, uri);
    if (!symbol) {
      continue;
    }
    result[uri] = [];
    const target = { uri, type: symbol.type };
    for (const id of symbol.symbolIds) {
      add(direct, id, target);
    }
    let types = links.get(symbol.type);
    if (!types) {
      types = linkedTypes(program, symbol.type);
      links.set(symbol.type, types);
    }
    for (const linkedType of types) {
      add(linked, `${linkedType}.${symbol.name}`, target);
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
      const hit = (target: { uri: string; type: string }) => {
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
          for (const target of linked.get(id) ?? []) {
            hit(target);
          }
        }
        for (const target of direct.get(id) ?? []) {
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
