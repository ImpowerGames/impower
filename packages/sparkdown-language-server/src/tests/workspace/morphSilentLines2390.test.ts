import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getHover } from "../../utils/providers/getHover";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";
import { completeAt } from "../providers/braceCompletionHarness";

const main = "file:///project/main.sd";
const asset = "file:///project/bunny.svg";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const story = (lines: string) => `define bunny as character with
  name = "BUNNY"
end

morph talk {
  blend = cut
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
  timing {
    trigger = speech
  }
}

scene start
${lines}
end
`;

function compiled(script: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program;
}

function workspaceFor(program: any) {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map<string, any>([[main, {}], [asset, { uri: asset, data: FACE }]]),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
  return {
    shownLayers: (context: any, struct: any, pick?: string) => workspace.morphShownLayers(context, struct, pick),
  };
}

const previewImage = (markup: string | undefined) =>
  decodeURIComponent(/<img src="([^"]*)"/.exec(markup ?? "")?.[1] ?? "");

async function hovered(lines: string) {
  const script = story(lines);
  const program = compiled(script);
  const options = workspaceFor(program);
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: main, text: script, version: 1, languageId: "sparkdown" } });
  const document = documents.get(main)!;
  const position = document.positionAt(script.indexOf("[[bunny") + 4);
  const hover = await getHover(document, documents.tree(main), documents.annotations(main), program, undefined, position, options);
  return previewImage((hover?.contents as any)?.value);
}

async function suggested(lines: string) {
  const script = story(lines);
  const program = compiled(script.replace("|", ""));
  const options = workspaceFor(program);
  const item = completeAt(script, program).find((item) => item.label === "teeth")!;
  expect(item).toBeDefined();
  const resolved = await resolveCompletion({ ...item, documentation: undefined }, program, options);
  return previewImage((resolved.documentation as any)?.value);
}

describe("the hover and the suggestion preview show the look the line shows (I-2390)", () => {
  test("hovering a directive on narration shows the directive's mouth, not the speech morph's rest", async () => {
    const src = await hovered("  [[bunny:mouth.teeth]]\n  This is Bunny.");
    expect(src).toContain("teeth");
    expect(src).not.toContain("closed");
  });

  test("hovering the same directive under its character's cue shows the speech morph's rest", async () => {
    const src = await hovered("  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!");
    expect(src).toContain("closed");
    expect(src).not.toContain("teeth");
  });

  test("a mouth suggestion on narration previews that mouth", async () => {
    const src = await suggested("  [[bunny:mouth.tee|]]\n  This is Bunny.");
    expect(src).toContain("teeth");
    expect(src).not.toContain("closed");
  });

  test("a mouth suggestion under the character's cue previews the speech morph's rest", async () => {
    const src = await suggested("  BUNNY:\n    [[bunny:mouth.tee|]]\n    Let go of that!");
    expect(src).toContain("closed");
  });
});
