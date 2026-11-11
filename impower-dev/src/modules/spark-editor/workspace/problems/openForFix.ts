import { fixActionsOf } from "@impower/codemirror-vscode-lsp-client/src/diagnostics";
import type {
  EditorFix,
  EditorFixChange,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { Diagnostic } from "vscode-languageserver-protocol";

export const FIX_OPEN_WAIT_MS = 6_000;

const SYNC_POLL_MS = 150;

export interface OpenForFixDeps {
  reveal: (fix: EditorFix) => Promise<unknown>;
  pull: (
    uri: string,
  ) => Promise<{ diagnostics: Diagnostic[]; version: number | undefined } | null>;
  record: (pulled: {
    uri: string;
    diagnostics: Diagnostic[];
    version: number | undefined;
  }) => void;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

const sameChanges = (a: readonly EditorFixChange[], b: readonly EditorFixChange[]) =>
  a.length === b.length &&
  a.every(
    (c, i) => c.from === b[i]!.from && c.to === b[i]!.to && c.insert === b[i]!.insert,
  );

export const findSameFix = (
  diagnostics: readonly Diagnostic[],
  fix: EditorFix,
): Diagnostic | undefined =>
  fix.expect === undefined
    ? undefined
    : diagnostics.find((diagnostic) =>
        fixActionsOf(diagnostic.data).some(
          (action) =>
            action.expect === fix.expect &&
            action.kind === fix.kind &&
            sameChanges(action.changes, fix.changes),
        ),
      );

const loadedVersion = (uri: string, timeoutMs: number) =>
  new Promise<number | null>((resolve) => {
    const stop = onProtocolMessage(DidLoadEditorMessage.type, (message) => {
      if (message.params.textDocument.uri === uri) {
        clearTimeout(timer);
        stop();
        resolve(message.params.textDocument.version);
      }
    });
    const timer = setTimeout(() => {
      stop();
      resolve(null);
    }, Math.max(0, timeoutMs));
  });

export const openScript = async (
  deps: OpenForFixDeps,
  fix: EditorFix,
  timeoutMs = FIX_OPEN_WAIT_MS,
) => {
  const loaded = loadedVersion(fix.uri, timeoutMs);
  await Promise.race([deps.reveal(fix), loaded]);
  return loaded;
};

export const openForFix = async (
  deps: OpenForFixDeps,
  fix: EditorFix,
): Promise<EditorFix | null> => {
  const now = deps.now ?? Date.now;
  const deadline = now() + FIX_OPEN_WAIT_MS;
  const version = await openScript(deps, fix, FIX_OPEN_WAIT_MS);
  if (version === null) {
    return null;
  }
  const wait = deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const late = Symbol("late");
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) {
      return null;
    }
    const pulled = await Promise.race([
      deps.pull(fix.uri),
      wait(remaining).then((): typeof late => late),
    ]);
    if (pulled === late || now() >= deadline) {
      return null;
    }
    if (pulled && pulled.version === version) {
      deps.record({ uri: fix.uri, ...pulled });
      const same = findSameFix(pulled.diagnostics, fix);
      return same ? { ...fix, version, range: same.range } : null;
    }
    await wait(SYNC_POLL_MS);
  }
};
