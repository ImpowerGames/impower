import type { EditorTool } from "@impower/spark-editor-protocol/src/protocols/editor/RequestedEditorToolMessage";
import type {
  ApplyWorkspaceEditResult,
  WorkspaceEdit,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import type {
  FindTextParams,
  FindTextResult,
  FindTextScript,
} from "@impower/spark-editor-protocol/src/protocols/workspace/FindTextMessage";
import { effect } from "@preact/signals";
import type {
  Location,
  Position,
  Range,
} from "vscode-languageserver-protocol";
import { failureOf, type EditorEditKind } from "./applyEditorEdit";
import {
  type FindOption,
  type NameSubject,
  type SearchGroup,
  type SearchSnapshot,
  type SearchView,
} from "./searchState";
import workspace from "./WorkspaceStore";
import type { NameAtCaret } from "./nameAtCaret";

export interface SearchFile {
  uri: string;
  name: string;
  type: string;
}

export interface SearchSources {
  openedUri: () => string | undefined;
  selection: () => Range | undefined;
  findText: (params: FindTextParams) => Promise<FindTextResult>;
  references: (uri: string, position: Position) => Promise<Location[]>;
  definitions: (uri: string, position: Position) => Promise<Location[]>;
  nameAtCaret: () => Promise<NameAtCaret | null>;
  prepareRename: (uri: string, position: Position) => Promise<Range | null>;
  renameEdits: (
    uri: string,
    position: Position,
    newName: string,
  ) => Promise<WorkspaceEdit | null>;
  fileReferences: (uri: string) => Promise<Location[]>;
  files: () => Promise<SearchFile[]>;
  fileText: (uri: string) => Promise<string>;
  applyEdit: (
    edit: WorkspaceEdit,
    label: string,
    kind: EditorEditKind,
  ) => Promise<ApplyWorkspaceEditResult>;
  showMatch: (uri: string, range: Range) => Promise<void>;
  openLocation: (uri: string, range: Range) => Promise<void>;
  openAsset: (uri: string) => Promise<void>;
  setMatches: (uri: string, ranges: Range[]) => void;
  revealRail: () => void;
  focusScript: () => void;
  autoRenameFiles: () => boolean;
  onTextChanged: (listener: () => void) => () => void;
  onEditorLoaded: (listener: () => void) => () => void;
  onEditorTool: (listener: (tool: EditorTool) => void) => () => void;
  onRenamed?: () => Promise<void>;
}

export const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const isMain = (uri: string) => uri.endsWith("/main.sd") || uri === "main.sd";

export const compareScripts = (a: string, b: string) =>
  isMain(a) === isMain(b) ? a.localeCompare(b) : isMain(a) ? -1 : 1;

const comparePositions = (a: Position, b: Position) =>
  a.line - b.line || a.character - b.character;

const sameRange = (a: Range, b: Range) =>
  comparePositions(a.start, b.start) === 0 &&
  comparePositions(a.end, b.end) === 0;

const DOCUMENT_START: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

export interface MatchTarget {
  uri: string;
  range: Range;
  index: number;
}

const flatten = (groups: readonly SearchGroup[]) => {
  const all: MatchTarget[] = [];
  for (const group of groups) {
    for (const use of group.uses) {
      all.push({ uri: group.uri, range: use.range, index: all.length + 1 });
    }
  }
  return all;
};

export const matchAt = (
  groups: readonly SearchGroup[],
  uri: string | undefined,
  selection: Range | undefined,
): MatchTarget | undefined =>
  uri && selection
    ? flatten(groups).find((m) => m.uri === uri && sameRange(m.range, selection))
    : undefined;

export const nextMatch = (
  groups: readonly SearchGroup[],
  uri: string | undefined,
  from: Range | undefined,
  backward = false,
): MatchTarget | undefined => {
  const all = flatten(groups);
  if (!all.length) {
    return undefined;
  }
  if (uri) {
    const here = all.filter((m) => m.uri === uri);
    const at = from ?? DOCUMENT_START;
    const found = backward
      ? here.filter((m) => comparePositions(m.range.end, at.start) <= 0).at(-1)
      : here.find((m) => comparePositions(m.range.start, at.end) >= 0);
    if (found) {
      return found;
    }
  }
  const scripts = groups.map((g) => g.uri);
  if (backward) {
    const before = uri
      ? scripts.filter((s) => compareScripts(s, uri) < 0).at(-1)
      : undefined;
    const script = before ?? scripts.at(-1)!;
    return all.filter((m) => m.uri === script).at(-1);
  }
  const after = uri
    ? scripts.find((s) => compareScripts(s, uri) > 0)
    : undefined;
  const script = after ?? scripts[0]!;
  return all.find((m) => m.uri === script);
};

export const findCount = (
  snapshot: Pick<SearchSnapshot, "groups" | "total">,
  uri: string | undefined,
  selection: Range | undefined,
) => {
  const scripts = snapshot.groups.length;
  const target =
    matchAt(snapshot.groups, uri, selection) ??
    nextMatch(snapshot.groups, uri, selection);
  return { index: target?.index ?? 0, total: snapshot.total, scripts };
};

const lineOf = (text: string, line: number) =>
  text.split(/\r\n|\r|\n/)[line] ?? "";

export const groupLocations = async (
  locations: readonly Location[],
  fileText: (uri: string) => Promise<string>,
  declarations: readonly Location[] = [],
): Promise<SearchGroup[]> => {
  const byUri = new Map<string, Location[]>();
  for (const location of locations) {
    const list = byUri.get(location.uri) ?? [];
    if (!list.some((l) => sameRange(l.range, location.range))) {
      list.push(location);
    }
    byUri.set(location.uri, list);
  }
  const groups = await Promise.all(
    [...byUri.entries()].map(async ([uri, list]) => {
      const text = await fileText(uri).catch(() => "");
      const uses = list
        .sort((a, b) => comparePositions(a.range.start, b.range.start))
        .map((l) => ({
          uri,
          range: l.range,
          lineText: lineOf(text, l.range.start.line),
          declaration: declarations.some(
            (d) => d.uri === uri && sameRange(d.range, l.range),
          ),
        }));
      return { uri, uses };
    }),
  );
  return groups.sort((a, b) => compareScripts(a.uri, b.uri));
};

const assetFilesNamed = (files: readonly SearchFile[], name: string) =>
  files.filter((f) => f.type !== "script" && f.name === name).map((f) => f.uri);

export const renameNote = (
  subject: NameSubject | undefined,
  uses: number,
  scripts: number,
  files: number,
) =>
  `Changes ${count(uses, "use")} in ${count(scripts, "script")}${
    files ? ` and renames ${count(files, "file")} in your assets` : ""
  }. The same word in dialogue and action stays as it is.${
    subject?.character ? " Cues keep their capitals." : ""
  }`;

export default class WorkspaceSearch {
  protected readonly _sources: SearchSources;

  protected _termEdits = 0;

  protected readonly _disposers: (() => void)[];

  protected _request = 0;

  protected _refreshing: Promise<void> = Promise.resolve();

  protected _exclusive: Promise<unknown> = Promise.resolve();

  protected _matchedUri: string | undefined;

  protected _published = "";

  constructor(sources: SearchSources) {
    this._sources = sources;
    this._disposers = [
      effect(() => {
        sources.openedUri();
        void workspace.search.value.open;
        this.publishMatches();
      }),
      effect(() => {
        const snapshot = workspace.search.value;
        const uri = sources.openedUri();
        const selection = sources.selection();
        const position = findCount(snapshot, uri, selection);
        const current = matchAt(snapshot.groups, uri, selection);
        workspace.searchPosition.value = {
          ...position,
          ...(current ? { current: { uri: current.uri, range: current.range } } : {}),
        };
      }),
      sources.onEditorTool((tool) => {
        const tools: Partial<Record<EditorTool, () => unknown>> = {
          find: () => this.openFindFromSelection(),
          findNext: () => this.stepOrOpen(false),
          findPrevious: () => this.stepOrOpen(true),
          rename: () => this.openRename(),
          references: () => this.openReferences(),
        };
        void tools[tool]?.();
      }),
      sources.onEditorLoaded(() => {
        this._published = "";
        this.publishMatches();
      }),
      sources.onTextChanged(() => {
        const snapshot = workspace.search.peek();
        if (snapshot.open && snapshot.view === "find" && snapshot.term) {
          void this.refresh();
        }
      }),
    ];
  }

  get snapshot() {
    return workspace.search.peek();
  }

  protected update(patch: Partial<SearchSnapshot>) {
    workspace.search.value = { ...workspace.search.peek(), ...patch };
  }

  protected say(status: string, statusTone: "info" | "error" = "info") {
    this.update({ status, statusTone });
  }

  open(view: SearchView = "find") {
    this._sources.revealRail();
    this.update({
      open: true,
      view,
      status: "",
      statusTone: "info",
      focusRequest: this.snapshot.focusRequest + 1,
    });
    if (view === "find") {
      void this.refresh();
    }
  }

  close() {
    this.update({ open: false, status: "" });
  }

  dismiss() {
    this.close();
    this._sources.focusScript();
  }

  async openFindFromSelection() {
    const uri = this._sources.openedUri();
    const selection = this._sources.selection();
    this.open("find");
    if (
      !uri ||
      !selection ||
      selection.start.line !== selection.end.line ||
      selection.start.character === selection.end.character
    ) {
      return;
    }
    const request = this.snapshot.focusRequest;
    const edits = this._termEdits;
    const line = lineOf(await this._sources.fileText(uri), selection.start.line);
    const from = Math.min(selection.start.character, selection.end.character);
    const to = Math.max(selection.start.character, selection.end.character);
    const term = line.slice(from, to);
    const now = this.snapshot;
    if (
      term.trim() &&
      now.open &&
      now.view === "find" &&
      this._termEdits === edits &&
      now.focusRequest === request
    ) {
      this.update({ term, focusRequest: now.focusRequest + 1 });
      await this.refresh();
    }
  }

  stepOrOpen(backward: boolean) {
    const { open, view, term } = this.snapshot;
    return open && view === "find" && term
      ? this.step(backward)
      : this.openFindFromSelection();
  }

  setTerm(term: string) {
    this._termEdits += 1;
    this.update({ term, status: "" });
    return this.refresh();
  }

  setReplacement(replacement: string) {
    this.update({ replacement });
  }

  toggleOption(option: FindOption) {
    const options = { ...this.snapshot.options };
    options[option] = !options[option];
    this.update({ options, status: "" });
    return this.refresh();
  }

  protected query(replacement?: string): FindTextParams {
    const { term, options } = this.snapshot;
    return {
      query: term,
      ...options,
      ...(replacement != null ? { replacement } : {}),
    };
  }

  protected queryKey() {
    const { term, options } = this.snapshot;
    return JSON.stringify([term, options]);
  }

  refresh() {
    const refreshing = this.runRefresh();
    this._refreshing = refreshing;
    return refreshing;
  }

  protected async runRefresh() {
    const request = ++this._request;
    const term = this.snapshot.term;
    const resultsFor = this.queryKey();
    if (!term) {
      this.update({ groups: [], total: 0, error: undefined, resultsFor });
      this.publishMatches();
      return;
    }
    const result = await this._sources.findText(this.query());
    if (request !== this._request) {
      return;
    }
    if ("error" in result) {
      this.update({ groups: [], total: 0, error: result.error, resultsFor });
    } else {
      const groups = result.scripts
        .map((script) => ({
          uri: script.uri,
          uses: script.matches.map((m) => ({
            uri: script.uri,
            range: m.range,
            lineText: m.lineText,
          })),
        }))
        .sort((a, b) => compareScripts(a.uri, b.uri));
      this.update({ groups, total: result.total, error: undefined, resultsFor });
    }
    this.publishMatches();
  }

  protected async currentResults() {
    while (this.snapshot.resultsFor !== this.queryKey()) {
      const refreshing = this._refreshing;
      await refreshing;
      if (refreshing === this._refreshing && this.snapshot.resultsFor !== this.queryKey()) {
        await this.refresh();
      }
    }
  }

  protected reading() {
    return workspace.effectiveScriptMode.peek() === "reading";
  }

  protected exclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = this._exclusive.then(run, run);
    this._exclusive = next.catch(() => undefined);
    return next;
  }

  protected async unchangedSince(scripts: readonly FindTextScript[]) {
    const opened = this._sources.openedUri();
    for (const script of scripts) {
      if (script.uri === opened) {
        continue;
      }
      const text = await this._sources.fileText(script.uri).catch(() => null);
      if (
        text == null ||
        script.matches.some((m) => lineOf(text, m.range.start.line) !== m.lineText)
      ) {
        return false;
      }
    }
    return true;
  }

  protected async refuseChanged() {
    this.say("A script changed while replacing. Nothing was replaced; try again.", "error");
    await this.refresh();
  }

  protected publishMatches() {
    const uri = this._sources.openedUri();
    const previous = this._matchedUri;
    const snapshot = this.snapshot;
    const ranges =
      snapshot.open && snapshot.view === "find" && uri
        ? (snapshot.groups.find((g) => g.uri === uri)?.uses ?? []).map(
            (use) => use.range,
          )
        : [];
    const published = JSON.stringify([uri, ranges]);
    if (published === this._published) {
      return;
    }
    if (previous && previous !== uri) {
      this._sources.setMatches(previous, []);
    }
    if (uri) {
      this._sources.setMatches(uri, ranges);
    }
    this._matchedUri = uri;
    this._published = published;
  }

  count() {
    return findCount(
      this.snapshot,
      this._sources.openedUri(),
      this._sources.selection(),
    );
  }

  async step(backward = false, from?: Range) {
    if (!this.snapshot.term) {
      this.say("Enter words to find.");
      return;
    }
    await this.currentResults();
    const { term, error, groups } = this.snapshot;
    if (!term) {
      return;
    }
    if (error) {
      return;
    }
    const target = nextMatch(
      groups,
      this._sources.openedUri(),
      from ?? this._sources.selection(),
      backward,
    );
    if (!target) {
      this.say("No matching text in any script. Try another word.");
      return;
    }
    this.say("");
    await this._sources.showMatch(target.uri, target.range);
  }

  replaceOne() {
    return this.exclusive(() => this.runReplaceOne());
  }

  protected async runReplaceOne() {
    if (this.reading()) {
      return;
    }
    if (!this.snapshot.term) {
      this.say("Enter words to find first.");
      return;
    }
    await this.currentResults();
    const { term, replacement, groups } = this.snapshot;
    const uri = this._sources.openedUri();
    const on = matchAt(groups, uri, this._sources.selection());
    if (!on || !uri) {
      await this.step();
      return;
    }
    const result = await this._sources.findText(this.query(replacement));
    if ("error" in result) {
      return;
    }
    const match = result.scripts
      .find((s) => s.uri === uri)
      ?.matches.find((m) => sameRange(m.range, on.range));
    if (!match) {
      return;
    }
    const newText = match.replacement ?? replacement;
    await this._sources.applyEdit(
      {
        documentChanges: [
          {
            textDocument: { uri, version: null },
            edits: [{ range: match.range, newText }],
          },
        ],
      },
      `Replace "${term}"`,
      "replace",
    );
    await this.refresh();
    const lines = newText.split(/\r\n|\r|\n/);
    const end =
      lines.length > 1
        ? { line: match.range.start.line + lines.length - 1, character: lines.at(-1)!.length }
        : {
            line: match.range.start.line,
            character: match.range.start.character + newText.length,
          };
    if (this.snapshot.total) {
      await this.step(false, { start: end, end });
    }
  }

  replaceAll() {
    return this.exclusive(() => this.runReplaceAll());
  }

  protected async runReplaceAll() {
    if (this.reading()) {
      return;
    }
    const { term, replacement } = this.snapshot;
    if (!term) {
      this.say("Enter words to find first.");
      return;
    }
    const result = await this._sources.findText(this.query(replacement));
    if ("error" in result) {
      return;
    }
    if (!result.total) {
      this.say("No matches in any script.");
      return;
    }
    if (!(await this.unchangedSince(result.scripts))) {
      await this.refuseChanged();
      return;
    }
    const outcome = await this._sources.applyEdit(
      {
        documentChanges: result.scripts.map((script) => ({
          textDocument: { uri: script.uri, version: null },
          edits: script.matches.map((m) => ({
            range: m.range,
            newText: m.replacement ?? replacement,
          })),
        })),
      },
      `Replace all "${term}"`,
      "replace",
    );
    if (!outcome.applied) {
      this.say(failureOf(outcome, "Nothing was replaced."), "error");
      return;
    }
    this.say(
      `Replaced ${count(result.total, "match", "matches")} in ${count(result.scripts.length, "script")}`,
    );
    await this.refresh();
  }

  protected async subjectOf(
    given?: NameAtCaret | NameSubject,
  ): Promise<NameSubject | undefined> {
    const found = given ?? (await this._sources.nameAtCaret());
    if (!found) {
      return undefined;
    }
    return "kind" in found
      ? {
          name: found.name,
          uri: found.uri,
          position: found.position,
          character: found.kind === "character",
        }
      : found;
  }

  protected async gather(subject: NameSubject) {
    const files = assetFilesNamed(await this._sources.files(), subject.name);
    const [uses, fileUses] = await Promise.all([
      subject.uri && subject.position
        ? this._sources.references(subject.uri, subject.position)
        : Promise.resolve([]),
      Promise.all(files.map((f) => this._sources.fileReferences(f))),
    ]);
    const located = [...uses, ...fileUses.flat()];
    const anchor =
      subject.uri && subject.position
        ? { uri: subject.uri, position: subject.position }
        : located[0]
          ? { uri: located[0].uri, position: located[0].range.start }
          : undefined;
    const definitions = anchor
      ? await this._sources
          .definitions(anchor.uri, anchor.position)
          .catch(() => [])
      : [];
    const references = await groupLocations(
      located,
      this._sources.fileText,
      definitions,
    );
    return { references, files };
  }

  async openReferences(given?: NameAtCaret | NameSubject) {
    const found = await this.subjectOf(given);
    this._sources.revealRail();
    this.update({
      open: true,
      view: "references",
      subject: found,
      references: [],
      files: [],
      status: "",
    });
    if (!found) {
      return;
    }
    const { references, files } = await this.gather(found);
    if (this.snapshot.subject !== found) {
      return;
    }
    this.update({ references, files });
  }

  async openRename(given?: NameAtCaret) {
    const found = await this.subjectOf(given);
    this._sources.revealRail();
    this.update({
      open: true,
      view: "rename",
      subject: found,
      references: [],
      files: [],
      renameName: found?.name ?? "",
      status: "",
      statusTone: "info",
    });
    if (!found) {
      return;
    }
    const { references, files } = await this.gather(found);
    if (this.snapshot.subject !== found) {
      return;
    }
    this.update({ references, files });
  }

  async openUse(use: { uri: string; range: Range }) {
    await this._sources.openLocation(use.uri, use.range);
  }

  async openAsset(uri: string) {
    await this._sources.openAsset(uri);
  }

  setRenameName(renameName: string) {
    this.update({ renameName, status: "", statusTone: "info" });
  }

  rename() {
    return this.exclusive(() => this.runRename());
  }

  protected async renamableRange(subject: NameSubject) {
    return subject.uri && subject.position
      ? this._sources.prepareRename(subject.uri, subject.position)
      : null;
  }

  protected async nameStillAt(subject: NameSubject, range: Range) {
    if (!subject.uri || range.start.line !== range.end.line) {
      return false;
    }
    const text = await this._sources.fileText(subject.uri).catch(() => "");
    return (
      lineOf(text, range.start.line).slice(range.start.character, range.end.character) ===
      subject.name
    );
  }

  protected async runRename() {
    if (this.reading()) {
      return false;
    }
    const { subject, renameName } = this.snapshot;
    const newName = renameName.trim();
    if (!subject?.uri || !subject.position) {
      return false;
    }
    if (newName === subject.name) {
      return false;
    }
    const range = await this.renamableRange(subject);
    if (!range) {
      this.say(`${subject.name} can't be renamed here.`, "error");
      return false;
    }
    if (!(await this.nameStillAt(subject, range))) {
      this.say(`The script changed and ${subject.name} is no longer there. Open Rename again.`, "error");
      return false;
    }
    let edit: WorkspaceEdit | null;
    try {
      edit = await this._sources.renameEdits(
        subject.uri,
        subject.position,
        newName,
      );
    } catch (e) {
      this.say(e instanceof Error ? e.message : String(e), "error");
      return false;
    }
    if (!edit) {
      this.say(`${subject.name} can't be renamed here.`, "error");
      return false;
    }
    const outcome = await this._sources.applyEdit(
      edit,
      `Rename ${subject.name} to ${newName}`,
      "rename-symbol",
    );
    if (!outcome.applied) {
      this.say(failureOf(outcome, "Nothing was renamed."), "error");
      return false;
    }
    await this._sources.onRenamed?.();
    this.dismiss();
    return true;
  }

  dispose() {
    this._disposers.forEach((dispose) => dispose());
  }
}
