import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import type { ImagePick } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { getHover } from "../../utils/providers/getHover";
import { createImageCompositeOptions } from "../../utils/providers/imagePreviewOptions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";
import { completeAt } from "../providers/braceCompletionHarness";

const main = "file:///project/main.sd";
const asset = "file:///project/bunny.svg";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lips mouth.open default" id="m-open"/>
<g data-name="lips mouth.closed" id="m-closed"/>
<g data-name="lips mouth.teeth" id="m-teeth"/>
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
    shownLayers: (context: any, struct: any, pick?: ImagePick) => workspace.morphShownLayers(context, struct, pick),
    workspace,
  };
}

const DRAWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g data-name="mouth.open default"><path data-name="lip" d="M20 50 Q50 90 80 50 Z" fill="#a33"/></g>
<g data-name="mouth.closed"><path data-name="lip" d="M20 60 L80 60 L80 64 L20 64 Z" fill="#a33"/></g>
<g data-name="mouth.teeth"><path data-name="lip" d="M20 50 L80 50 L80 70 L20 70 Z" fill="#fff"/></g>
</svg>`;

async function bakedHover(lines: string) {
  const script = story(lines);
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "bunny", ext: "svg", data: DRAWN },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: main } }).program;
  const { workspace } = workspaceFor(program);
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: main, text: script, version: 1, languageId: "sparkdown" } });
  const document = documents.get(main)!;
  const position = document.positionAt(script.indexOf("[[bunny") + 5);
  const hover = await getHover(document, documents.tree(main), documents.annotations(main), program, undefined, position, createImageCompositeOptions(workspace));
  return previewImage((hover?.contents as any)?.value);
}

const previewImage = (markup: string | undefined) =>
  decodeURIComponent(/<img src="([^"]*)"/.exec(markup ?? "")?.[1] ?? "");

async function hovered(lines: string, needle = "[[bunny", head = "") {
  const script = `${head}${story(lines)}`;
  const program = compiled(script);
  const options = workspaceFor(program);
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: main, text: script, version: 1, languageId: "sparkdown" } });
  const document = documents.get(main)!;
  const position = document.positionAt(script.indexOf(needle) + needle.length - 2);
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

describe("the hover and the suggestion preview show the directive's own look on every line (I-2442)", () => {
  test.each([
    ["on narration", "  [[bunny:mouth.teeth]]\n  This is Bunny."],
    ["under its character's cue", "  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!"],
    ["on a directive line above its character's cue", "  [[bunny:mouth.teeth]]\n  BUNNY:\n    Let go of that!"],
  ])("hovering a directive %s shows the directive's mouth, not the speech morph's rest", async (_, lines) => {
    const src = await hovered(lines);
    expect(src).toContain("teeth");
    expect(src).not.toContain("closed");
  });

  test("hovering an image named outside any directive keeps the preview a named look gets", async () => {
    const head = 'define teeth as filtered_image with\n  image = image.bunny\n  attributes = { "mouth.teeth" }\nend\n\n';
    const src = await hovered("  This is Bunny.", "image = image.bunny", head);
    expect(src).toContain("closed");
  });

  test("the baked render, read from the server's own copy of the art, shows the directive's mouth on narration and under the cue", async () => {
    const narration = await bakedHover("  [[bunny:mouth.teeth]]\n  This is Bunny.");
    const spoken = await bakedHover("  BUNNY:\n    [[bunny:mouth.teeth]]\n    Let go of that!");
    for (const src of [narration, spoken]) {
      expect(src).toContain("data-name='mouth.teeth'");
      expect(src).not.toContain("mouth.closed");
    }
  });

  test.each([
    ["on narration", "  [[bunny:mouth.tee|]]\n  This is Bunny."],
    ["under its character's cue", "  BUNNY:\n    [[bunny:mouth.tee|]]\n    Let go of that!"],
  ])("a mouth suggestion %s previews that mouth", async (_, lines) => {
    const src = await suggested(lines);
    expect(src).toContain("teeth");
    expect(src).not.toContain("closed");
  });
});
