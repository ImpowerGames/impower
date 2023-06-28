import type {
  CompletionItem,
  CompletionParams,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  CompletionItemKind,
  InsertTextFormat,
  InsertTextMode,
  MarkupKind,
  createConnection,
} from "vscode-languageserver/browser";

import { SPARK_REGEX } from "../../sparkdown/src/constants/SPARK_REGEX";
import {
  DidParseParams,
  DidParseTextDocument,
} from "./classes/DidParseTextDocument";
import SparkdownTextDocuments from "./classes/SparkdownTextDocuments";
import getColorPresentations from "./utils/getColorPresentations";
import getDocumentColors from "./utils/getDocumentColors";
import getDocumentDiagnostics from "./utils/getDocumentDiagnostics";
import getFencedCode from "./utils/getFencedCode";
import getFoldingRanges from "./utils/getFoldingRanges";
import getLineText from "./utils/getLineText";
import getUniqueOptions from "./utils/getUniqueOptions";

console.log("running sparkdown-language-server");

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(messageReader, messageWriter);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  const capabilities: ServerCapabilities = {
    foldingRangeProvider: true,
    colorProvider: true,
    completionProvider: {
      resolveProvider: true,
      triggerCharacters: [".", "\n", "\r", "-", " "],
      completionItem: {
        labelDetailsSupport: true,
      },
    },
  };
  return { capabilities };
});

const documents = new SparkdownTextDocuments(TextDocument);

// parseProvider
documents.onDidParse((change) => {
  const params: DidParseParams = {
    uri: change.document.uri,
    version: change.document.version,
    program: change.program,
  };
  connection.sendNotification(DidParseTextDocument.method, params);
  connection.sendDiagnostics(
    getDocumentDiagnostics(change.document, change.program)
  );
});

// foldingRangeProvider
connection.onFoldingRanges((params) => {
  const uri = params.textDocument.uri;
  const document = documents.get(uri);
  const program = documents.program(uri);
  return getFoldingRanges(document, program);
});

// colorProvider
connection.onDocumentColor((params) => {
  const uri = params.textDocument.uri;
  const document = documents.get(uri);
  const program = documents.program(uri);
  return getDocumentColors(document, program);
});
connection.onColorPresentation((params) => {
  return getColorPresentations(params.color);
});

// completionProvider
connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  try {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    if (!document) {
      return [];
    }
    const lineText = getLineText(document, params.position);
    const triggerCharacter = params.context?.triggerCharacter;
    if (triggerCharacter === "\n" || triggerCharacter === "\r") {
      return [];
    }
    const sceneMatch = lineText.match(SPARK_REGEX.scene);
    if (triggerCharacter === " " && sceneMatch) {
      const location = sceneMatch[3];
      const dash = sceneMatch[5];
      const time = sceneMatch[7];
      if (!location) {
        const locations = getUniqueOptions(
          program?.metadata.scenes?.map((s) => s.location)
        );
        return locations.map((location) => ({
          label: location,
          kind: CompletionItemKind.Module,
        }));
      }
      if (dash && !time) {
        const times = getUniqueOptions([
          ...(program?.metadata.scenes?.map((s) => s.time) || []),
          "DAY",
          "NIGHT",
        ]);
        return times.map((time) => ({
          label: time,
          kind: CompletionItemKind.Module,
        }));
      }
    }
    if (!triggerCharacter && !sceneMatch) {
      return [
        {
          label: "INT.",
          labelDetails: {
            description: "Interior Scene",
          },
          detail: "An indoor scene",
          documentation: {
            kind: MarkupKind.Markdown,
            value: getFencedCode(`INT. BEDROOM - NIGHT`),
          },
          insertText: "INT. ${1:LOCATION} - ${2:TIME}",
          insertTextFormat: InsertTextFormat.Snippet,
          insertTextMode: InsertTextMode.adjustIndentation,
          kind: CompletionItemKind.Interface,
        },
        {
          label: "EXT.",
          labelDetails: {
            description: "Exterior Scene",
          },
          detail: "An outdoor scene",
          documentation: {
            kind: MarkupKind.Markdown,
            value: getFencedCode(`EXT. BEACH - DAY`),
          },
          insertText: "EXT. ${1:LOCATION} - ${2:TIME}",
          insertTextFormat: InsertTextFormat.Snippet,
          insertTextMode: InsertTextMode.adjustIndentation,
          kind: CompletionItemKind.Interface,
        },
        {
          label: "INT./EXT.",
          labelDetails: {
            description: "Intercut Scene",
          },
          detail: "A scene that is intercut between indoors and outdoors",
          documentation: {
            kind: MarkupKind.Markdown,
            value: getFencedCode(`INT./EXT. PHONE BOOTH`),
          },
          insertText: "INT./EXT. ${1:LOCATION} - ${2:TIME}",
          insertTextFormat: InsertTextFormat.Snippet,
          insertTextMode: InsertTextMode.adjustIndentation,
          kind: CompletionItemKind.Interface,
        },
      ];
    }
  } catch (e) {
    console.error(e);
  }
  return [];
});
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

documents.listen(connection);

connection.listen();
