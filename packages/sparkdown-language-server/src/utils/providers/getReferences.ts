import { RangeCursor } from "@codemirror/state";
import { SparkdownAnnotation } from "@impower/sparkdown/src/classes/SparkdownAnnotation";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { Reference } from "@impower/sparkdown/src/classes/annotators/ReferenceAnnotator";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { type Tree } from "@lezer/common";
import {
  Location,
  ReferenceContext,
  type Position,
} from "vscode-languageserver";
import SparkdownTextDocuments from "../../classes/SparkdownTextDocuments";
import { getSymbolContext } from "../annotations/getSymbolContext";
import { resolveDivertPath } from "../annotations/resolveDivertPath";
import { resolveSymbolId } from "../annotations/resolveSymbolId";
import { getSymbol } from "./getSymbol";
import { getSymbolIds } from "./getSymbolIds";

export const getReferences = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  documents: SparkdownTextDocuments,
  position: Position,
  context: ReferenceContext & {
    excludeUses?: boolean;
    includeInterdependent: boolean;
    includeLinks: boolean;
  }
): {
  resolvedSymbolIds?: string[];
  locations?: Location[];
} => {
  if (!document || !tree) {
    return {};
  }
  const { symbol, nameRange } = getSymbol(document, tree, position);
  if (!symbol) {
    return {};
  }

  const symbolName = document?.getText(nameRange);

  const { symbolIds, interdependentIds } = getSymbolIds(
    documents.annotations(document.uri),
    symbol
  );
  if (!symbolIds && !interdependentIds) {
    return {};
  }

  const { scopePath: symbolScopePath, reference: symbolReference } =
    getSymbolContext(
      document,
      documents.annotations(document.uri).references,
      symbol.from
    );

  const locations: Location[] = [];
  const resolvedSymbolIds: string[] = [];

  const foundReferences: Record<string, Set<number>> = {};

  const addAsset = (type: string) => {
    const possibleNameSuffixes =
      type === "font"
        ? ["", "__bolditalic", "__bold_italic", "__bold", "__italic"]
        : [""];
    for (const suffix of possibleNameSuffixes) {
      for (const uri of documents.findFiles(symbolName + suffix, type)) {
        locations.push({
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
    }
  };

  const addSymbol = (uri: string, from: number, to: number) => {
    const document = documents.get(uri);
    if (document) {
      const foundReferencesInDocument = foundReferences[uri];
      if (!foundReferencesInDocument || !foundReferencesInDocument.has(from)) {
        foundReferences[uri] ??= new Set();
        foundReferences[uri].add(from);
        locations.push({
          uri,
          range: {
            start: document.positionAt(from),
            end: document.positionAt(to),
          },
        });
      }
    }
  };

  const addMatchingSymbols = (
    uri: string,
    r: RangeCursor<SparkdownAnnotation<Reference>>,
    refScopePath: string
  ) => {
    if (r.value) {
      const refSymbolIds = r.value.type.symbolIds;
      if (refSymbolIds) {
        for (const refId of refSymbolIds) {
          const resolvedRefId = resolveSymbolId(
            refId,
            r.value.type,
            refScopePath,
            program,
            documents.compilerConfig
          );
          const fullyResolvedRefId =
            resolvedRefId && r.value.type.usage === "divert"
              ? resolveDivertPath(resolvedRefId, refScopePath)
              : resolvedRefId;
          if (fullyResolvedRefId) {
            if (symbolIds) {
              for (const symbolId of symbolIds) {
                const resolvedSymbolId = resolveSymbolId(
                  symbolId,
                  symbolReference,
                  symbolScopePath,
                  program,
                  documents.compilerConfig
                );
                if (resolvedSymbolId) {
                  resolvedSymbolIds.push(resolvedSymbolId);
                  if (r.value.type.linkable) {
                    if (context.includeLinks) {
                      if (resolvedSymbolId.includes(".")) {
                        const [type, name] = resolvedSymbolId.split(".");
                        if (type) {
                          const link =
                            program?.context?.[type]?.["$default"]?.["$link"];
                          if (link) {
                            for (const linkedType of Object.keys(link)) {
                              const linkedId = linkedType + "." + name;
                              if (fullyResolvedRefId === linkedId) {
                                addSymbol(uri, r.from, r.to);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  if (fullyResolvedRefId === resolvedSymbolId) {
                    if (
                      context.includeDeclaration ||
                      !r.value.type.declaration
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
                      if (!context.excludeUses || r.value.type.declaration) {
                        addSymbol(uri, r.from, r.to);
                        if (r.value.type.firstMatchOnly) {
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
            if (context.includeInterdependent && !context.excludeUses) {
              if (interdependentIds) {
                for (const interdependentId of interdependentIds) {
                  const resolvedSymbolId = resolveSymbolId(
                    interdependentId,
                    symbolReference,
                    symbolScopePath,
                    program,
                    documents.compilerConfig
                  );
                  if (resolvedSymbolId) {
                    resolvedSymbolIds.push(resolvedSymbolId);
                    if (fullyResolvedRefId === resolvedSymbolId) {
                      addSymbol(uri, r.from, r.to);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  for (const uri of documents.uris()) {
    const document = documents.get(uri);
    const annotations = documents.annotations(uri);
    if (document && annotations) {
      const read = (from: number, to: number) =>
        document.getText({
          start: document.positionAt(from),
          end: document.positionAt(to),
        }) || "";
      let scopePathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [];
      let scopeKind: "" | "knot" | "stitch" = "";
      const r = annotations.references.iter();
      while (r.value) {
        if (r.value.type.declaration === "knot") {
          scopePathParts = [];
          scopeKind = "knot";
        }
        if (r.value.type.declaration === "stitch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind === "stitch") {
            scopePathParts.pop();
          }
          scopeKind = "stitch";
        }
        if (read(r.from, r.to) === symbolName) {
          const refScopePath = scopePathParts.map((p) => p.name).join(".");
          addMatchingSymbols(uri, r, refScopePath);
        }
        if (
          r.value.type.declaration === "knot" ||
          r.value.type.declaration === "stitch"
        ) {
          scopePathParts.push({ kind: scopeKind, name: read(r.from, r.to) });
        }
        r.next();
      }
    }
  }

  const result = { locations, resolvedSymbolIds };
  return result;
};
