/**
 * A stand-in for the parts of the `vscode` module the completion preview uses,
 * so tests can load the extension's own modules and drive VS Code's events.
 * `vi.mock("vscode", ...)` returns `fakeVscode()`; the test then fires events
 * through `emitters` and inspects `registered` and `commands.executed`.
 */

type Listener<T> = (value: T) => unknown;

export class EventEmitter<T> {
  listeners = new Set<Listener<T>>();
  event = (listener: Listener<T>) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(value: T) {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
  dispose() {
    this.listeners.clear();
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
  isEqual(other: Position) {
    return this.line === other.line && this.character === other.character;
  }
}

export class Range {
  constructor(
    readonly start: Position,
    readonly end: Position,
  ) {}
}

export class Selection extends Range {
  constructor(
    readonly anchor: Position,
    readonly active: Position,
  ) {
    const forward =
      anchor.line < active.line ||
      (anchor.line === active.line && anchor.character <= active.character);
    super(forward ? anchor : active, forward ? active : anchor);
  }
}

export class SnippetString {
  constructor(readonly value: string) {}
}

/** A text document holding `text`, at `uri`, in a workspace folder unless
 *  `outside` is set. */
export const document = (
  uri: string,
  text: string,
  version = 1,
  outside = false,
) => ({
  uri: { toString: () => uri, outside },
  languageId: "sparkdown",
  eol: 1,
  version,
  getText: () => text,
  lineAt: (line: number) => ({ text: text.split("\n")[line] ?? "" }),
});

export type FakeDocument = ReturnType<typeof document>;

export const fakeVscode = () => {
  const emitters = {
    changeTextDocument: new EventEmitter<any>(),
    openTextDocument: new EventEmitter<any>(),
    closeTextDocument: new EventEmitter<any>(),
    changeActiveTextEditor: new EventEmitter<any>(),
    changeTextEditorSelection: new EventEmitter<any>(),
  };
  const registered: {
    inlineProviders: { selector: unknown; provider: any }[];
  } = { inlineProviders: [] };
  const executed: { command: string; args: unknown[] }[] = [];
  const window = {
    activeTextEditor: undefined as any,
    visibleTextEditors: [] as any[],
    onDidChangeActiveTextEditor: emitters.changeActiveTextEditor.event,
    onDidChangeTextEditorSelection: emitters.changeTextEditorSelection.event,
  };
  const workspace = {
    textDocuments: [] as FakeDocument[],
    onDidChangeTextDocument: emitters.changeTextDocument.event,
    onDidOpenTextDocument: emitters.openTextDocument.event,
    onDidCloseTextDocument: emitters.closeTextDocument.event,
    getWorkspaceFolder: (uri: { outside?: boolean }) =>
      uri.outside ? undefined : { uri },
    getConfiguration: () => ({}),
  };
  return {
    EventEmitter,
    Position,
    Range,
    Selection,
    SnippetString,
    TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
    EndOfLine: { LF: 1, CRLF: 2 },
    languages: {
      registerInlineCompletionItemProvider: (
        selector: unknown,
        provider: any,
      ) => {
        registered.inlineProviders.push({ selector, provider });
        return { dispose: () => {} };
      },
    },
    commands: {
      executed,
      executeCommand: async (command: string, ...args: unknown[]) => {
        executed.push({ command, args });
      },
    },
    window,
    workspace,
    emitters,
    registered,
  };
};

export type FakeVscode = ReturnType<typeof fakeVscode>;

/** An editor showing `doc` with `selections`, the first being the primary. */
export const editor = (doc: FakeDocument, selections: Selection[]) => ({
  document: doc,
  selection: selections[0]!,
  selections,
});
