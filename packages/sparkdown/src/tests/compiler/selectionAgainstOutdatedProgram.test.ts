// Clicking a line in the editor is answered by looking that line up in the
// compiled program's path locations. Those describe the script as it was when
// the program was compiled, so a click that lands after an edit and before the
// recompile — the compile is debounced, so that window is every click made in
// the first fraction of a second after typing — would be answered about
// whatever used to stand at that line number. In #489 the author typed two
// lines into a dialogue block, clicked the new line, and the preview showed
// the line that had been pushed two lines further down.
//
// The compiler is the one place that holds both the compiled program and the
// live documents, so it is what says whether a selection can be resolved at
// all. These tests pin that verdict, and pin that it is stamped on the params
// the selection listeners see.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SelectedCompilerDocumentMessage } from "../../compiler/classes/messages/SelectedCompilerDocumentMessage";

const URI = "inmemory:///main.sd";

const SOURCE = [
  "$:",
  "  A MOONLIT ROOFTOP",
  "",
  "BUNNY:",
  "  Nice night for it. >",
  "  Isn't it though. >",
  "  Or is it?",
  "",
].join("\n");

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compilerWithSource(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler;
}

/** The author types a new dialogue line into the middle of the block, as the
 *  editor reports it: a whole-document replacement at the next version. */
function typeNewLine(compiler: SparkdownCompiler, version: number) {
  const edited = [
    "$:",
    "  A MOONLIT ROOFTOP",
    "",
    "BUNNY:",
    "  Nice night for it. >",
    "  Isn't it though. >",
    "  Wait, do you hear that? >",
    "  Or is it?",
    "",
  ].join("\n");
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [{ text: edited }],
  } as never);
}

function select(compiler: SparkdownCompiler, line: number) {
  return compiler.selectDocument({
    textDocument: { uri: URI },
    selectedRange: {
      start: { line, character: 0 },
      end: { line, character: 0 },
    },
    docChanged: false,
    userEvent: true,
  } as never);
}

describe("a selection made against a program the document has outrun (#489)", () => {
  it("is not outdated while the document matches the compiled program", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });

  it("is outdated once the document has been edited since that compile", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);

    expect(compiler.isProgramOutdated()).toBe(true);
    // Line 6 (zero-based) is the line the author just typed. Against the
    // program compiled before the edit it is `Or is it?`, which is the wrong
    // answer and the whole of the bug.
    expect(select(compiler, 6).programOutdated).toBe(true);
  });

  it("stops being outdated once the edit has been compiled", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });

  it("tells the selection listeners before they run", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);

    // The player's workspace worker plans a story route from this listener,
    // against the game holding the compiled program. It has to see the verdict
    // when it runs, not after.
    const seen: (boolean | undefined)[] = [];
    compiler.addEventListener(SelectedCompilerDocumentMessage.method, (p) => {
      seen.push(p.programOutdated);
    });
    select(compiler, 6);

    expect(seen).toEqual([true]);
  });

  it("says nothing is outdated when no compile has happened yet", () => {
    // Nothing to compare against. A consumer with no fresher answer coming is
    // better served by whatever program it holds than by no answer at all.
    const compiler = compilerWithSource(SOURCE);

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });
});
