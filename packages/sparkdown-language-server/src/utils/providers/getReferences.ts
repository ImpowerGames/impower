import { RangeCursor } from "@codemirror/state";
import { SparkdownAnnotation } from "@impower/sparkdown/src/compiler/classes/SparkdownAnnotation";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { Reference } from "@impower/sparkdown/src/compiler/classes/annotators/ReferenceAnnotator";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type Tree } from "@lezer/common";
import {
  DocumentHighlight,
  DocumentHighlightKind,
  Location,
  ReferenceContext,
  type Position,
} from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getSymbolContext } from "../annotations/getSymbolContext";
import { referenceBindings } from "../annotations/referenceBindings";
import { resolveDivertPath } from "../annotations/resolveDivertPath";
import { resolveSymbolId } from "../annotations/resolveSymbolId";
import { getSymbol } from "./getSymbol";
import { getSymbolIds } from "./getSymbolIds";

const recursivelyGetKeys = (obj: any, keys: string[] = []): string[] => {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      keys.push(key);
      if (typeof obj[key] === "object" && obj[key] !== null) {
        recursivelyGetKeys(obj[key], keys);
      }
    }
  }
  return keys;
};

export const linkedTypes = (
  program: SparkProgram | undefined,
  type: string,
): string[] => recursivelyGetKeys(program?.context?.[type]?.["$default"]?.["$link"]);

export interface ReferenceTarget {
  symbolName: string | undefined;
  symbolIds: string[] | undefined;
  interdependentIds?: string[] | undefined;
  symbolReference?: Reference | undefined;
  symbolScopePath?: string | undefined;
  seedUri?: string | undefined;
  symbolFrom?: number | undefined;
}

export type ReferenceSearchContext = ReferenceContext & {
  searchOtherFiles: boolean;
  excludeUses?: boolean;
  includeInterdependent: boolean;
  includeLinks: boolean;
  addAssetFiles?: boolean;
};

export const collectReferencesForTarget = (
  program: SparkProgram | undefined,
  workspace: SparkdownLanguageServerWorkspace,
  target: ReferenceTarget,
  context: ReferenceSearchContext,
): {
  resolvedSymbolIds: string[];
  references: (Location & DocumentHighlight)[];
} => {
  const {
    symbolName,
    symbolIds,
    interdependentIds,
    symbolReference,
    symbolScopePath,
    seedUri,
    symbolFrom,
  } = target;

  const references: (Location & DocumentHighlight)[] = [];
  const resolvedSymbolIds: string[] = [];

  const foundReferences: Record<string, Set<number>> = {};

  const addAsset = (type: string) => {
    if (!context.addAssetFiles || !symbolName) {
      return;
    }
    const uris =
      type === "font"
        ? workspace.findFontFamilyFiles(symbolName).map(({ uri }) => uri)
        : workspace.findFiles(symbolName, type);
    for (const uri of uris) {
      references.push({
        uri,
        range: {
          start: {
            line: 0,
            character: 0,
          },
          end: {
            line: 0,
            character: 0,
          },
        },
      });
    }
  };

  const addSymbol = (
    uri: string,
    r: RangeCursor<SparkdownAnnotation<Reference>>,
  ) => {
    const from = r.from;
    const to = r.to;
    const kind = getDocumentHighlightKind(r);
    const document = workspace.document(uri);
    if (document) {
      const foundReferencesInDocument = foundReferences[uri];
      if (!foundReferencesInDocument || !foundReferencesInDocument.has(from)) {
        foundReferences[uri] ??= new Set();
        foundReferences[uri].add(from);
        references.push({
          uri,
          range: document.range(from, to),
          kind,
        });
      }
    }
  };

  const getDocumentHighlightKind = (
    r: RangeCursor<SparkdownAnnotation<Reference>>,
  ) => {
    return r.value?.type.kind === "write"
      ? DocumentHighlightKind.Write
      : r.value?.type.kind === "read"
        ? DocumentHighlightKind.Read
        : DocumentHighlightKind.Text;
  };

  const resolveTargetIds = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) =>
        resolveSymbolId(
          id,
          symbolReference,
          symbolScopePath,
          program,
          workspace.compilerConfig,
        ),
      )
      .filter((id): id is string => !!id);
  const targetIds = resolveTargetIds(symbolIds);
  const targetInterdependentIds =
    context.includeInterdependent && !context.excludeUses
      ? resolveTargetIds(interdependentIds)
      : [];
  resolvedSymbolIds.push(...targetIds, ...targetInterdependentIds);
  const bindingAt = referenceBindings(workspace);
  const targetBinding =
    seedUri && symbolFrom != null
      ? bindingAt(seedUri, symbolFrom, symbolReference)
      : undefined;
  const targetPathIsLocal = targetBinding !== undefined && symbolReference?.root != null;

  const addMatchingSymbols = (
    uri: string,
    r: RangeCursor<SparkdownAnnotation<Reference>>,
    refScopePath: string,
  ) => {
    const reference = r.value?.type;
    if (!reference || targetPathIsLocal) {
      return;
    }
    if (targetBinding !== undefined) {
      if (
        uri === seedUri &&
        reference.root == null &&
        (context.includeDeclaration || !reference.declaration) &&
        (!context.excludeUses || reference.declaration) &&
        bindingAt(uri, r.from, reference) === targetBinding
      ) {
        addSymbol(uri, r);
      }
      return;
    }
    let sameBinding: boolean | undefined;
    const add = () => {
      sameBinding ??= bindingAt(uri, r.from, reference) === undefined;
      if (sameBinding) {
        addSymbol(uri, r);
      }
      return sameBinding;
    };
    for (const refId of reference.symbolIds ?? []) {
      const resolvedRefId = resolveSymbolId(
        refId,
        reference,
        refScopePath,
        program,
        workspace.compilerConfig,
      );
      const fullyResolvedRefId =
        resolvedRefId && reference.usage === "divert"
          ? resolveDivertPath(resolvedRefId, refScopePath)
          : resolvedRefId;
      if (!fullyResolvedRefId) {
        continue;
      }
      for (const resolvedSymbolId of targetIds) {
        if (reference.linkable && context.includeLinks && resolvedSymbolId.includes(".")) {
          const [type, name] = resolvedSymbolId.split(".");
          if (type) {
            for (const linkedType of linkedTypes(program, type)) {
              if (fullyResolvedRefId === linkedType + "." + name) {
                add();
              }
            }
          }
        }
        if (
          fullyResolvedRefId === resolvedSymbolId &&
          (context.includeDeclaration || !reference.declaration)
        ) {
          if (resolvedSymbolId === `image.${symbolName}`) {
            addAsset("image");
          }
          if (resolvedSymbolId === `audio.${symbolName}`) {
            addAsset("audio");
          }
          if (resolvedSymbolId === `video.${symbolName}`) {
            addAsset("video");
          }
          if (resolvedSymbolId === `font.${symbolName}`) {
            addAsset("font");
          }
          if ((!context.excludeUses || reference.declaration) && add() && reference.firstMatchOnly) {
            break;
          }
        }
      }
      for (const resolvedSymbolId of targetInterdependentIds) {
        if (fullyResolvedRefId === resolvedSymbolId) {
          add();
        }
      }
    }
  };

  const searchUris = context.searchOtherFiles
    ? workspace.uris()
    : seedUri
      ? [seedUri]
      : [];

  for (const uri of searchUris) {
    walkReferences(workspace, uri, (r, refScopePath) => {
      addMatchingSymbols(uri, r, refScopePath);
    });
  }

  return { references, resolvedSymbolIds };
};

export const walkReferences = (
  workspace: Pick<SparkdownLanguageServerWorkspace, "document" | "annotations">,
  uri: string,
  visit: (
    r: RangeCursor<SparkdownAnnotation<Reference>>,
    scopePath: string,
  ) => void,
): void => {
  const document = workspace.document(uri);
  const annotations = workspace.annotations(uri);
  if (!document || !annotations) {
    return;
  }
  let scopePathParts: {
    kind: "" | "function" | "scene" | "branch" | "knot" | "stitch";
    name: string;
  }[] = [];
  let scopeKind: "" | "function" | "scene" | "branch" | "knot" | "stitch" = "";
  const r = annotations.references.iter();
  while (r.value) {
    if (r.value.type.declaration === "function") {
      scopePathParts = [];
      scopeKind = "function";
    }
    if (r.value.type.declaration === "scene") {
      scopePathParts = [];
      scopeKind = "scene";
    }
    if (r.value.type.declaration === "branch") {
      const prevKind = scopePathParts.at(-1)?.kind || "";
      if (prevKind === "branch" || prevKind === "stitch") {
        scopePathParts.pop();
      }
      scopeKind = "branch";
    }
    visit(r, scopePathParts.map((p) => p.name).join("."));
    if (
      r.value.type.declaration === "function" ||
      r.value.type.declaration === "scene" ||
      r.value.type.declaration === "branch"
    ) {
      scopePathParts.push({ kind: scopeKind, name: document.read(r.from, r.to) });
    }
    r.next();
  }
};

export const getReferences = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  workspace: SparkdownLanguageServerWorkspace,
  position: Position,
  context: ReferenceSearchContext,
): {
  resolvedSymbolIds?: string[];
  references?: (Location & DocumentHighlight)[];
} => {
  if (!document) {
    console.warn("no document available");
    return {};
  }
  if (!tree) {
    console.warn("no tree available");
    return {};
  }
  const { symbol, nameRange } = getSymbol(document, tree, position);
  if (!symbol) {
    return {};
  }

  const symbolName = document?.getText(nameRange);

  const { symbolIds, interdependentIds } = getSymbolIds(
    workspace.annotations(document.uri),
    symbol,
  );
  if (!symbolIds && !interdependentIds) {
    return {
      references: [
        {
          uri: document.uri,
          range: document.range(symbol.from, symbol.to),
          kind: DocumentHighlightKind.Text,
        },
      ],
    };
  }

  const { scopePath: symbolScopePath, reference: symbolReference } =
    getSymbolContext(
      document,
      workspace.annotations(document.uri).references,
      symbol.from,
    );

  return collectReferencesForTarget(
    program,
    workspace,
    {
      symbolName,
      symbolIds,
      interdependentIds,
      symbolReference,
      symbolScopePath,
      seedUri: document.uri,
      symbolFrom: symbol.from,
    },
    context,
  );
};
