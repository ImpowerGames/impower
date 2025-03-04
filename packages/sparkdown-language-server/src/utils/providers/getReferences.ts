import { type Tree } from "@lezer/common";
import {
  Location,
  LocationLink,
  ReferenceContext,
  type Position,
} from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";
import SparkdownTextDocuments from "../../classes/SparkdownTextDocuments";
import { getSymbol } from "./getSymbol";
import { getSymbolIds } from "./getSymbolIds";
import { RangeCursor } from "@codemirror/state";
import { SparkdownAnnotation } from "@impower/sparkdown/src/classes/SparkdownAnnotation";
import { Reference } from "@impower/sparkdown/src/classes/annotators/ReferenceAnnotator";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { resolveDivertPath } from "../annotations/resolveDivertPath";
import { resolveSymbolId } from "../annotations/resolveSymbolId";
import { getSymbolContext } from "../annotations/getSymbolContext";

export const getReferences = (
  document: TextDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  documents: SparkdownTextDocuments,
  position: Position,
  context: ReferenceContext & {
    excludeUses?: boolean;
    includeInterdependent: boolean;
  }
): {
  resolvedSymbolIds?: string[];
  locations?: Location[];
} => {
  if (!document || !tree) {
    return {};
  }
  const symbol = getSymbol(document, tree, position);
  if (!symbol) {
    return {};
  }

  const symbolName = document?.getText({
    start: document.positionAt(symbol.from),
    end: document.positionAt(symbol.to),
  });

  const symbolIds = getSymbolIds(
    documents.annotations(document.uri),
    symbol,
    context.includeInterdependent
  );
  if (symbolIds.length === 0) {
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
      if (context.includeInterdependent && r.value.type.interdependentIds) {
        refSymbolIds?.push(...r.value.type.interdependentIds);
      }
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
                if (fullyResolvedRefId === resolvedSymbolId) {
                  if (context.includeDeclaration || !r.value.type.declaration) {
                    if (!context.excludeUses || r.value.type.declaration) {
                      addSymbol(uri, r.from, r.to);
                    }
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
