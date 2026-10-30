import type {
Range,
TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

import { type ChangeSpec, type Text } from "@codemirror/state";
import { type Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { type TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { isLuauFile } from "../typecheck/LuauUnitNodes";
import { noteLuauDocumentEdit } from "../typecheck/readLuauAst";
import { collectDefineTypeNames } from "../utils/collectDefineTypeNames";
import { createSparkdownParser } from "../utils/createSparkdownParser";
import { documentString, documentText, editedDocumentText } from "../utils/documentString";
import { profile } from "../utils/profile";
import {
  type SparkdownAnnotatorConfigs,
  type SparkdownAnnotators,
  SparkdownCombinedAnnotator,
  type SparkdownCombinedAnnotatorSnapshot,
} from "./SparkdownCombinedAnnotator";
import { SparkdownDocument } from "./SparkdownDocument";

const DEBUG = false;

const NEWLINE_REGEX = /\r\n|\r|\n/g;

const LANGUAGE_ID = "sparkdown";

const MINT_SPAN = 4096;

export type SparkdownDocumentContentChangeEvent =
  TextDocumentContentChangeEvent;

interface TextDocumentState {
  tree?: Tree;
  treeFragments?: readonly TreeFragment[];
  treeVersion?: number;
  text?: Text;
  annotators: SparkdownCombinedAnnotator;
}

export interface SparkdownDocumentSnapshot {
  uri: string;
  document: SparkdownDocument;
  tree?: Tree;
  treeFragments?: readonly TreeFragment[];
  treeVersion?: number;
  text?: Text;
  annotators: SparkdownCombinedAnnotatorSnapshot;
  compiler?: Compiler;
  edited?: { from: number; suffix: number };
}

export class SparkdownDocumentRegistry {
  protected _parser: TextmateGrammarParser = createSparkdownParser();
  get parser() {
    return this._parser;
  }

  protected _luauFileParser?: TextmateGrammarParser;

  parserFor(uri: string): TextmateGrammarParser {
    if (!isLuauFile(uri)) {
      return this._parser;
    }
    this._luauFileParser ??= createSparkdownParser(uri);
    return this._luauFileParser;
  }

  protected _profilerId?: string;
  get profilerId() {
    return this._profilerId;
  }
  set profilerId(value: string | undefined) {
    this._profilerId = value;
  }

  protected _syncedDocuments = new Map<string, SparkdownDocument>();

  protected _documentStates = new Map<string, TextDocumentState>();

  protected _annotate?: Set<keyof SparkdownAnnotators>;

  protected _config?: SparkdownAnnotatorConfigs;

  constructor(
    annotate?: (keyof SparkdownAnnotators)[],
    config?: SparkdownAnnotatorConfigs,
  ) {
    this._annotate = new Set(annotate);
    this._config = config;
  }

  protected getDocumentState(uri: string): TextDocumentState {
    const state = this._documentStates.get(uri);
    if (state) {
      return state;
    }
    const newState = {
      annotators: new SparkdownCombinedAnnotator(this._config),
    };
    this._documentStates.set(uri, newState);
    return newState;
  }

  protected updateSyntaxTree(
    beforeDocument: SparkdownDocument,
    afterDocument: SparkdownDocument,
    changes?: readonly TextDocumentContentChangeEvent[],
  ): Tree {
    const state = this.getDocumentState(afterDocument.uri);
    if (state.tree && state.treeVersion === afterDocument.version) {
      return state.tree;
    }
    if (changes && state.treeFragments) {
      profile(
        "start",
        this._profilerId,
        "incrementalParse",
        beforeDocument.uri,
      );
      let changeDocument = new SparkdownDocument(
        beforeDocument.uri,
        beforeDocument.languageId,
        beforeDocument.version,
        beforeDocument.getText(),
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
        state.treeFragments = TreeFragment.applyChanges(state.treeFragments, [
          treeChange,
        ]);
        const documentLengthBeforeChange = changeDocument.length;
        this.noteSnapshotEdit(
          afterDocument.uri,
          fromA,
          documentLengthBeforeChange - toA,
        );
        changeDocument.update([change], changeDocument.version + 1);
        const documentLengthAfterChange = changeDocument.length;
        const text =
          state.text && state.text.length === documentLengthBeforeChange
            ? editedDocumentText(state.text, fromA, toA, change.text, changeDocument.getText())
            : documentText(changeDocument.getText());
        if (state.text) {
          noteLuauDocumentEdit(documentString(state.text), documentString(text), fromA, toA, toB);
        }
        state.text = text;
        state.tree = this.parserFor(afterDocument.uri).parse(changeDocument, state.treeFragments);
        state.treeFragments = TreeFragment.addTree(
          state.tree,
          state.treeFragments,
        );
        state.annotators.update(
          state.tree,
          text,
          [annotationChange],
          Math.max(
            toA + change.text.length,
            state.tree.length,
            documentLengthBeforeChange,
            documentLengthAfterChange,
          ),
          this._annotate,
          afterDocument.uri,
        );
      }
      state.treeVersion = afterDocument.version;
      profile("end", this._profilerId, "incrementalParse", beforeDocument.uri);
      if (DEBUG) {
        this.print(afterDocument.uri);
      }
      return state.tree!;
    } else {
      profile("start", this._profilerId, "fullParse", beforeDocument.uri);
      this.noteSnapshotEdit(afterDocument.uri, 0, 0);
      const text = documentText(afterDocument.getText());
      state.text = text;
      state.tree = this.parserFor(afterDocument.uri).parse(afterDocument);
      state.treeFragments = TreeFragment.addTree(state.tree);
      state.annotators.create(state.tree, text, this._annotate, afterDocument.uri);
      state.treeVersion = afterDocument.version;
      profile("end", this._profilerId, "fullParse", beforeDocument.uri);
      if (DEBUG) {
        this.print(beforeDocument.uri);
      }
      return state.tree;
    }
  }

  protected ensureParsed(uri: string) {
    const syncedDocument = this._syncedDocuments.get(uri);
    if (!syncedDocument) {
      return;
    }
    const state = this.getDocumentState(uri);
    if (!state.tree || state.treeVersion !== syncedDocument.version) {
      this.updateSyntaxTree(syncedDocument, syncedDocument);
    }
  }

  tree(uri: string) {
    this.ensureParsed(uri);
    const state = this.getDocumentState(uri);
    return state.tree;
  }

  annotations(uri: string) {
    this.ensureParsed(uri);
    const state = this.getDocumentState(uri);
    return state.annotators.get();
  }

  memoStats(uri: string) {
    return this._documentStates.get(uri)?.annotators.current.compilations.memoStats;
  }

  relowerCompilations(
    uri: string,
    ranges: readonly { from: number; to: number }[],
  ) {
    this.ensureParsed(uri);
    const state = this.getDocumentState(uri);
    if (state.tree && ranges.length > 0) {
      state.annotators.relowerCompilations(state.tree, ranges);
    }
  }

  defineTypeNames(uri: string): ReadonlySet<string> {
    this.ensureParsed(uri);
    const state = this.getDocumentState(uri);
    const indexed = state.annotators.defineTypeNames;
    if (indexed) {
      return indexed;
    }
    const document = this._syncedDocuments.get(uri);
    if (!state.tree || !document) {
      return new Set<string>();
    }
    const text = document.getText();
    return collectDefineTypeNames(state.tree, (from, to) =>
      text.slice(from, to),
    );
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

  add(
    params: {
      textDocument: {
        uri: string;
        text: string;
        version: number | null;
        languageId: string | null;
      };
    },
    options?: { defer?: boolean },
  ) {
    return this.set(params, options);
  }

  set(
    params: {
      textDocument: {
        uri: string;
        text: string;
        version: number | null;
        languageId: string | null;
      };
    },
    options?: { defer?: boolean },
  ) {
    const td = params.textDocument;
    const beforeDocument =
      this._syncedDocuments.get(td.uri) ||
      new SparkdownDocument(td.uri, td.languageId ?? LANGUAGE_ID, -1, "");
    const syncedDocument = new SparkdownDocument(
      td.uri,
      td.languageId ?? LANGUAGE_ID,
      td.version ?? beforeDocument.version + 1,
      td.text.replace(NEWLINE_REGEX, "\n"),
    );
    this._syncedDocuments.set(td.uri, syncedDocument);
    if (options?.defer) {
      const state = this.getDocumentState(td.uri);
      state.tree = undefined;
      state.treeFragments = undefined;
      state.treeVersion = undefined;
      state.text = undefined;
      return true;
    }
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
        `Received document change event for ${td.uri} without valid version identifier`,
      );
    }
    const existingDocument = this._syncedDocuments.get(td.uri);
    if (existingDocument && existingDocument.version === td.version) {
      return false;
    }
    let syncedDocument =
      this._syncedDocuments.get(td.uri) ||
      new SparkdownDocument(td.uri, LANGUAGE_ID, td.version - 1, "");
    if (syncedDocument) {
      const beforeDocument = new SparkdownDocument(
        syncedDocument.uri,
        syncedDocument.languageId,
        syncedDocument.version,
        syncedDocument.getText(),
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
          normalizedChanges,
        );
      }
    }
    return true;
  }

  snapshot(
    uri: string,
    editedFrom?: number,
  ): SparkdownDocumentSnapshot | undefined {
    const document = this._syncedDocuments.get(uri);
    if (!document || this._snapshots.has(uri)) {
      return undefined;
    }
    if (editedFrom !== undefined) {
      this.mintSplitPoints(uri, document, editedFrom);
    }
    this._syncedDocuments.set(uri, document.clone());
    const state = this.getDocumentState(uri);
    const compiler = state.tree?.prop(cachedCompilerProp);
    const snapshot: SparkdownDocumentSnapshot = {
      uri,
      document,
      tree: state.tree,
      treeFragments: state.treeFragments,
      treeVersion: state.treeVersion,
      text: state.text,
      annotators: state.annotators.snapshot(this._annotate),
      compiler: compiler?.beginJournal() ? compiler : undefined,
    };
    this._snapshots.set(uri, snapshot);
    return snapshot;
  }

  restore(snapshot: SparkdownDocumentSnapshot) {
    this._snapshots.delete(snapshot.uri);
    this._syncedDocuments.set(snapshot.uri, snapshot.document);
    const state = this.getDocumentState(snapshot.uri);
    const edited = snapshot.edited;
    if (edited && state.text && snapshot.text) {
      noteLuauDocumentEdit(
        documentString(state.text),
        documentString(snapshot.text),
        edited.from,
        state.text.length - edited.suffix,
        snapshot.text.length - edited.suffix,
      );
    }
    snapshot.compiler?.rollback();
    state.tree = snapshot.tree;
    state.treeFragments = snapshot.treeFragments;
    state.treeVersion = snapshot.treeVersion;
    state.text = snapshot.text;
    state.annotators.restore(snapshot.annotators);
  }

  protected mintSplitPoints(
    uri: string,
    document: SparkdownDocument,
    pos: number,
  ) {
    const state = this.getDocumentState(uri);
    const tree = state.tree;
    const compiler = tree?.prop(cachedCompilerProp);
    if (
      !tree ||
      !compiler ||
      !state.treeFragments ||
      state.treeVersion !== document.version ||
      (tree as { __compilerEpoch?: number }).__compilerEpoch !==
        compiler.reuseEpoch
    ) {
      return;
    }
    const range = compiler.reparseRange(pos);
    const recorded = this._unsplit.get(compiler);
    const unsplit =
      recorded?.epoch === compiler.reuseEpoch ? recorded.ranges : [];
    if (
      range.to - range.from <= MINT_SPAN ||
      unsplit.some((r) => r.from <= pos && pos <= r.to)
    ) {
      return;
    }
    const length = document.getText().length;
    const from = Math.min(pos, length - 1);
    if (from < 0) {
      return;
    }
    profile("start", this._profilerId, "mintSplitPoints", uri);
    const minted = this.parserFor(uri).parse(
      document,
      TreeFragment.applyChanges(state.treeFragments, [
        { fromA: from, toA: from + 1, fromB: from, toB: from + 1 },
      ]),
    );
    if (minted.prop(cachedCompilerProp) === compiler) {
      (tree as { __compilerEpoch?: number }).__compilerEpoch =
        compiler.reuseEpoch;
      const after = compiler.reparseRange(pos);
      this._unsplit.set(compiler, {
        epoch: compiler.reuseEpoch,
        ranges:
          after.to - after.from > MINT_SPAN ? [...unsplit, after] : unsplit,
      });
    } else {
      this._unsplit.set(compiler, {
        epoch: compiler.reuseEpoch,
        ranges: [...unsplit, range],
      });
    }
    profile("end", this._profilerId, "mintSplitPoints", uri);
  }

  protected _unsplit = new WeakMap<
    Compiler,
    { epoch: number; ranges: { from: number; to: number }[] }
  >();

  protected _snapshots = new Map<string, SparkdownDocumentSnapshot>();

  protected noteSnapshotEdit(uri: string, from: number, suffix: number) {
    const snapshot = this._snapshots.get(uri);
    if (!snapshot) {
      return;
    }
    snapshot.edited = snapshot.edited
      ? {
          from: Math.min(snapshot.edited.from, from),
          suffix: Math.min(snapshot.edited.suffix, suffix),
        }
      : { from, suffix };
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
