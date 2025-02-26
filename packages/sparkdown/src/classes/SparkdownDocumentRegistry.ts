import {
  TextDocument,
  TextDocumentContentChangeEvent,
  Range,
} from "vscode-languageserver-textdocument";

import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";

import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { Input, Tree, TreeFragment, ChangedRange } from "@lezer/common";
import { ChangeSpec } from "@codemirror/state";
import { SparkdownCombinedAnnotator } from "./SparkdownCombinedAnnotator";

export type SparkdownDocumentContentChangeEvent =
  TextDocumentContentChangeEvent;

interface TextDocumentState {
  tree?: Tree;
  treeFragments?: readonly TreeFragment[];
  treeVersion?: number;
  annotators: SparkdownCombinedAnnotator;
}

class TextDocumentInput implements Input {
  constructor(private readonly document: TextDocument) {}

  get length() {
    return this.document.offsetAt(this.document.positionAt(Number.MAX_VALUE));
  }

  chunk(from: number): string {
    const start = this.document.positionAt(from);
    const end = { line: start.line + 1, character: 0 };
    return this.document.getText({ start, end });
  }

  lineChunks = false;

  read(from: number, to: number): string {
    const start = this.document.positionAt(from);
    const end = this.document.positionAt(to);
    return this.document.getText({ start, end });
  }
}

export class SparkdownDocumentRegistry {
  protected _parser: TextmateGrammarParser = new TextmateGrammarParser(
    GRAMMAR_DEFINITION
  );

  protected _syncedDocuments = new Map<string, TextDocument>();

  protected _documentStates = new Map<string, TextDocumentState>();

  protected getDocumentState(uri: string): TextDocumentState {
    const state = this._documentStates.get(uri);
    if (state) {
      return state;
    }
    const newState = {
      annotators: new SparkdownCombinedAnnotator(),
    };
    this._documentStates.set(uri, newState);
    return newState;
  }

  protected updateSyntaxTree(
    beforeDocument: TextDocument,
    afterDocument: TextDocument,
    changes?: readonly TextDocumentContentChangeEvent[]
  ): Tree {
    const state = this.getDocumentState(afterDocument.uri);
    if (state.tree && state.treeVersion === afterDocument.version) {
      // Return cached tree if up to date
      return state.tree;
    }
    if (changes && state.treeFragments) {
      performance.mark(`incremental parse ${beforeDocument.uri} start`);
      // Incremental parse
      let changeDocument = TextDocument.create(
        beforeDocument.uri,
        beforeDocument.languageId,
        beforeDocument.version,
        beforeDocument.getText()
      );
      for (const change of changes) {
        const c: {
          range: Range;
          text: string;
        } =
          "range" in change
            ? {
                range: change.range,
                text: change.text,
              }
            : {
                range: {
                  start: { line: 0, character: 0 },
                  end: changeDocument.positionAt(Number.MAX_VALUE),
                },
                text: change.text,
              };
        const treeChange: ChangedRange = {
          fromA: changeDocument.offsetAt(c.range.start),
          toA: changeDocument.offsetAt(c.range.end),
          fromB: changeDocument.offsetAt(c.range.start),
          toB: changeDocument.offsetAt(c.range.start) + c.text.length,
        };
        const annotationChange: ChangeSpec = {
          from: changeDocument.offsetAt(c.range.start),
          to: changeDocument.offsetAt(c.range.end),
          insert: c.text,
        };
        // We must apply these changes to the tree one at a time because
        // TextDocumentContentChangeEvent[] positions are relative to the doc after each change,
        // and ChangedRange[] positions are relative to the starting doc.
        state.treeFragments = TreeFragment.applyChanges(state.treeFragments, [
          treeChange,
        ]);
        changeDocument = TextDocument.update(
          changeDocument,
          [c],
          changeDocument.version + 1
        );
        const input = new TextDocumentInput(changeDocument);
        state.tree = this._parser.parse(input, state.treeFragments);
        state.treeFragments = TreeFragment.addTree(
          state.tree,
          state.treeFragments
        );
        state.annotators.update(changeDocument, state.tree, [annotationChange]);
      }
      state.treeVersion = afterDocument.version;
      performance.mark(`incremental parse ${beforeDocument.uri} end`);
      performance.measure(
        `incremental parse ${beforeDocument.uri}`,
        `incremental parse ${beforeDocument.uri} start`,
        `incremental parse ${beforeDocument.uri} end`
      );
      // this.print(beforeDocument.uri);
      return state.tree!;
    } else {
      // First full parse
      performance.mark(`full parse ${beforeDocument.uri} start`);
      const input = new TextDocumentInput(afterDocument);
      state.tree = this._parser.parse(input);
      state.treeFragments = TreeFragment.addTree(state.tree);
      state.annotators.update(afterDocument, state.tree);
      state.treeVersion = afterDocument.version;
      performance.mark(`full parse ${beforeDocument.uri} end`);
      performance.measure(
        `full parse ${beforeDocument.uri}`,
        `full parse ${beforeDocument.uri} start`,
        `full parse ${beforeDocument.uri} end`
      );
      // this.print(beforeDocument.uri);
      return state.tree;
    }
  }

  tree(uri: string) {
    const state = this.getDocumentState(uri);
    return state.tree;
  }

  annotations(uri: string) {
    const state = this.getDocumentState(uri);
    return state.annotators.get();
  }

  get(uri: string) {
    return this._syncedDocuments.get(uri);
  }

  has(uri: string) {
    return this._syncedDocuments.has(uri);
  }

  keys() {
    return this._syncedDocuments.keys();
  }

  all() {
    return this._syncedDocuments.values();
  }

  print(uri: string) {
    const tree = this.tree(uri);
    const document = this.get(uri);
    if (tree && document) {
      console.log(printTree(tree, document.getText()));
    }
  }

  add(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    const td = params.textDocument;
    const syncedDocument = TextDocument.create(
      td.uri,
      td.languageId,
      td.version,
      td.text
    );
    this._syncedDocuments.set(td.uri, syncedDocument);
    const beforeDocument = TextDocument.create(td.uri, td.languageId, -1, "");
    this.updateSyntaxTree(beforeDocument, syncedDocument);
    return true;
  }

  update(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: TextDocumentContentChangeEvent[];
  }) {
    const td = params.textDocument;
    const changes = params.contentChanges;
    if (changes.length === 0) {
      return false;
    }
    if (td.version == null) {
      throw new Error(
        `Received document change event for ${td.uri} without valid version identifier`
      );
    }
    let syncedDocument =
      this._syncedDocuments.get(td.uri) ||
      TextDocument.create(td.uri, "sparkdown", td.version - 1, "");
    if (syncedDocument) {
      const beforeDocument = TextDocument.create(
        syncedDocument.uri,
        syncedDocument.languageId,
        syncedDocument.version,
        syncedDocument.getText()
      );
      syncedDocument = TextDocument.update(syncedDocument, changes, td.version);
      if (syncedDocument) {
        this._syncedDocuments.set(td.uri, syncedDocument);
        this.updateSyntaxTree(beforeDocument, syncedDocument, changes);
      }
    }
    return true;
  }

  remove(params: {
    textDocument: {
      uri: string;
    };
  }) {
    const td = params.textDocument;
    const syncedDocument = this._syncedDocuments.get(td.uri);
    this._syncedDocuments.delete(td.uri);
    this._documentStates.delete(td.uri);
    return Boolean(syncedDocument);
  }
}
