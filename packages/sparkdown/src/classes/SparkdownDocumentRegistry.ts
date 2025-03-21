import {
  Range,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";

import { ChangeSpec, Text } from "@codemirror/state";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { profile } from "../utils/profile";
import {
  SparkdownAnnotators,
  SparkdownCombinedAnnotator,
} from "./SparkdownCombinedAnnotator";
import { SparkdownDocument } from "./SparkdownDocument";

const DEBUG = false;

const NEWLINE_REGEX = /\r\n|\r|\n/g;

export type SparkdownDocumentContentChangeEvent =
  TextDocumentContentChangeEvent;

interface TextDocumentState {
  tree?: Tree;
  treeFragments?: readonly TreeFragment[];
  treeVersion?: number;
  annotators: SparkdownCombinedAnnotator;
}

export class SparkdownDocumentRegistry {
  protected _parser: TextmateGrammarParser = new TextmateGrammarParser(
    GRAMMAR_DEFINITION
  );
  get parser() {
    return this._parser;
  }

  protected _syncedDocuments = new Map<string, SparkdownDocument>();

  protected _documentStates = new Map<string, TextDocumentState>();

  protected _profilingIdentifier = "";

  protected _annotate?: Set<keyof SparkdownAnnotators>;

  constructor(
    profilingIdentifier: string,
    annotate?: (keyof SparkdownAnnotators)[]
  ) {
    this._profilingIdentifier = profilingIdentifier;
    this._annotate = new Set(annotate);
  }

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
    beforeDocument: SparkdownDocument,
    afterDocument: SparkdownDocument,
    changes?: readonly TextDocumentContentChangeEvent[]
  ): Tree {
    const state = this.getDocumentState(afterDocument.uri);
    if (state.tree && state.treeVersion === afterDocument.version) {
      // Return cached tree if up to date
      return state.tree;
    }
    if (changes && state.treeFragments) {
      profile(
        "start",
        this._profilingIdentifier + "/incrementalParse",
        beforeDocument.uri
      );
      // Incremental parse
      let changeDocument = new SparkdownDocument(
        beforeDocument.uri,
        beforeDocument.languageId,
        beforeDocument.version,
        beforeDocument.getText()
      );
      for (const c of changes) {
        const change: {
          range: Range;
          text: string;
        } =
          "range" in c
            ? {
                range: c.range,
                text: c.text,
              }
            : {
                range: {
                  start: { line: 0, character: 0 },
                  end: changeDocument.positionAt(Number.MAX_VALUE),
                },
                text: c.text,
              };
        const fromA = changeDocument.offsetAt(change.range.start);
        const toA = changeDocument.offsetAt(change.range.end);
        const fromB = changeDocument.offsetAt(change.range.start);
        const toB =
          changeDocument.offsetAt(change.range.start) + change.text.length;
        const treeChange: ChangedRange = {
          fromA,
          toA,
          fromB,
          toB,
        };
        const annotationChange: ChangeSpec = {
          from: fromA,
          to: toA,
          insert: change.text,
        };
        // We must apply these changes to the tree one at a time because
        // TextDocumentContentChangeEvent[] positions are relative to the doc after each change,
        // and ChangedRange[] positions are relative to the starting doc.
        state.treeFragments = TreeFragment.applyChanges(state.treeFragments, [
          treeChange,
        ]);
        const documentLengthBeforeChange = changeDocument.length;
        changeDocument.update([change], changeDocument.version + 1);
        const documentLengthAfterChange = changeDocument.length;
        const text = Text.of(changeDocument.getText().split("\n"));
        state.tree = this._parser.parse(changeDocument, state.treeFragments);
        state.treeFragments = TreeFragment.addTree(
          state.tree,
          state.treeFragments
        );
        state.annotators.update(
          state.tree,
          text,
          [annotationChange],
          Math.max(
            toA + change.text.length,
            state.tree.length,
            documentLengthBeforeChange,
            documentLengthAfterChange
          ),
          this._annotate
        );
      }
      state.treeVersion = afterDocument.version;
      profile(
        "end",
        this._profilingIdentifier + "/incrementalParse",
        beforeDocument.uri
      );
      if (DEBUG) {
        this.print(afterDocument.uri);
      }
      return state.tree!;
    } else {
      // First full parse
      profile(
        "start",
        this._profilingIdentifier + "/fullParse",
        beforeDocument.uri
      );
      const text = Text.of(afterDocument.getText().split("\n"));
      state.tree = this._parser.parse(afterDocument);
      state.treeFragments = TreeFragment.addTree(state.tree);
      state.annotators.create(state.tree, text, this._annotate);
      state.treeVersion = afterDocument.version;
      profile(
        "end",
        this._profilingIdentifier + "/fullParse",
        beforeDocument.uri
      );
      if (DEBUG) {
        this.print(beforeDocument.uri);
      }
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
      console.log(printTree(tree, document));
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
    const syncedDocument = new SparkdownDocument(
      td.uri,
      td.languageId,
      td.version,
      td.text.replace(NEWLINE_REGEX, "\n")
    );
    this._syncedDocuments.set(td.uri, syncedDocument);
    const beforeDocument = new SparkdownDocument(td.uri, td.languageId, -1, "");
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
      new SparkdownDocument(td.uri, "sparkdown", td.version - 1, "");
    if (syncedDocument) {
      const beforeDocument = new SparkdownDocument(
        syncedDocument.uri,
        syncedDocument.languageId,
        syncedDocument.version,
        syncedDocument.getText()
      );
      const normalizedChanges: TextDocumentContentChangeEvent[] = [];
      for (const c of changes) {
        const normalizedText = c.text.replace(NEWLINE_REGEX, "\n");
        if ("range" in c) {
          normalizedChanges.push({
            range: c.range,
            text: normalizedText,
          });
        } else {
          normalizedChanges.push({
            text: normalizedText,
          });
        }
      }
      syncedDocument.update(normalizedChanges, td.version);
      if (syncedDocument) {
        this._syncedDocuments.set(td.uri, syncedDocument);
        this.updateSyntaxTree(
          beforeDocument,
          syncedDocument,
          normalizedChanges
        );
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
