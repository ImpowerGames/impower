import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, test, vi } from "vitest";
import { compileProject, complete } from "../../sparkdown-language-server/src/tests/providers/completionHarness";
import { serverCompletionSource } from "../src/completion";
import { LSPPlugin } from "../src/plugin";

const DEFS = `define raffles as character with
  name = "RAFFLES"
end

define raffles@shy as character with
end

define bunny as character with
  name = "BUNNY"
end
`;

const TRIGGERS = [".", ",", " ", "\n", "\r", "-", "{", "}", "(", ")", "[", "]", "<", ">", "^", "$", "%", "@", "#", ":", "+", "~", '"', "="];

const views: EditorView[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const view of views.splice(0)) view.destroy();
});

async function accept(markedCue: string, label: string): Promise<string | undefined> {
  const marked = `${DEFS}\nscene start\n  ${markedCue}\n    Hello.\nend\n`;
  const pos = marked.indexOf("@1");
  const source = marked.replace("@1", "");
  const response = complete(marked, { program: compileProject(source) });
  const view = new EditorView({
    state: EditorState.create({ doc: source, selection: { anchor: pos } }),
    parent: document.body,
  });
  views.push(view);
  vi.spyOn(LSPPlugin, "get").mockReturnValue({
    client: {
      hasCapability: () => true,
      sync: () => undefined,
      serverCapabilities: { completionProvider: { triggerCharacters: TRIGGERS } },
      request: async () => response.items,
    },
    toPosition: () => ({ line: 0, character: pos }),
  } as any);
  const result = (await serverCompletionSource(new CompletionContext(view.state, pos, true, view))) as CompletionResult;
  const chosen = result.options.find((option) => option.label === label)!;
  if (typeof chosen.apply !== "function") throw new Error("the completion has no apply function");
  chosen.apply(view, chosen, result.from, result.to ?? pos);
  return view.state.doc.toString().split("\n").find((line) => line.startsWith("  ???"));
}

describe("accepting a speaker completion after `as` in the editor (#2283)", () => {
  test.each([
    ["at the end of a typed prefix", "??? as r@1:", "raffles", "  ??? as raffles:"],
    ["inside an existing speaker", "??? as r@1affles:", "raffles", "  ??? as raffles:"],
    ["inside a speaker before its parenthetical and position", "??? as r@1affles (O.S.) [<]:", "raffles", "  ??? as raffles (O.S.) [<]:"],
    ["after a typed `@` part", "??? as raffles@s@1:", "raffles@shy", "  ??? as raffles@shy:"],
    ["after a trailing `@` on a cue being typed", "??? as raffles@@1", "raffles@shy", "  ??? as raffles@shy: "],
    ["inside a speaker on a cue being typed", "??? as r@1affles", "raffles", "  ??? as raffles: "],
  ])("%s replaces the whole speaker", async (_label, cue, label, accepted) => {
    expect(await accept(cue, label)).toBe(accepted);
  });
});
