import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: vi.fn(),
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceAssets } = await import("../../src/modules/spark-editor/workspace/WorkspaceAssets");
const { pictureKey } = await import("../../src/modules/spark-editor/workspace/assetsListing");
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");

const PROJECT = "project";
const P = "Assets/Images/Portraits";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const stack = (name: string) => [`${P}/${name}.png`, `${P}/${name}~face.happy~default.png`, `${P}/${name}~face.sad.png`];

const NAMES = Array.from({ length: 12 }, (_, index) => `person_${String(index).padStart(2, "0")}`);

type Answer = (src: string | null) => void;

function fakeWorkspace(paths: readonly string[]) {
  const versions = new Map(paths.map((path) => [path, 1]));
  const asked: { uri: string; variant: unknown; size: number; answer: Answer }[] = [];
  const fs = {
    getFiles: vi.fn(async () =>
      Object.fromEntries(
        [...versions].map(([path, version]) => [
          uri(path),
          { uri: uri(path), size: 1, modified: 1, src: `/src/${path}?v=${version}` },
        ]),
      ),
    ),
    getFolders: vi.fn(async () => []),
    getFileUri: (_: string, path: string) => uri(path),
    getRelativePath: (_: string, u: string) => u.slice(`file:///${PROJECT}/`.length),
  };
  const ls = {
    getVariantPicture: vi.fn(
      (pictureUri: string, variant: unknown, size: number) =>
        new Promise<{ src: string; layers: (string | null)[] } | null>((done) => {
          asked.push({ uri: pictureUri, variant, size, answer: (src) => done(src === null ? null : { src, layers: [] }) });
        }),
    ),
  };
  const assets = new WorkspaceAssets({ fs, ls, window: {}, autoRenameFiles: () => true } as never);
  return { assets, asked, versions };
}

const keyOf = (paths: readonly string[]) => pictureKey(workspace.assetListing.peek()!, paths);

const answer = async (entry: { answer: Answer } | undefined, src: string | null) => {
  entry!.answer(src);
  await settle();
};

const compiled = async () => {
  sendProtocolMessage(CompiledProgramMessage.type.notification({ program: {} } as never));
  await settle();
};

beforeEach(() => {
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: PROJECT } };
  workspace.assetListing.value = null;
  workspace.assetPictures.value = {};
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
});

describe("a stacked picture's resting picture for the Assets page", () => {
  it("asks the language server for the picture the inspector shows before a variant is chosen, at its cover", async () => {
    const { assets, asked } = fakeWorkspace(stack("imani"));
    await assets.load();
    assets.requestPicture(stack("imani"));
    expect(asked.map(({ uri, variant }) => [uri, variant])).toEqual([[uri(`${P}/imani.png`), { image: "imani", attributes: [] }]]);
    expect(asked[0]!.size).toBe(Math.round(384 * (globalThis.devicePixelRatio || 1)));
    await answer(asked[0], "data:image/webp;base64,imani");
    expect(workspace.assetPictures.value).toEqual({ [keyOf(stack("imani"))]: "data:image/webp;base64,imani" });
  });

  it("asks once for a picture several tiles show, and not again when a tile comes back", async () => {
    const { assets, asked } = fakeWorkspace(stack("imani"));
    await assets.load();
    const leave = assets.requestPicture(stack("imani"));
    assets.requestPicture(stack("imani"));
    await answer(asked[0], "data:composed");
    await compiled();
    await answer(asked[1], "data:composed");
    leave();
    assets.requestPicture(stack("imani"));
    await compiled();
    expect(asked).toHaveLength(2);
  });

  it("asks for at most eight at once, and never for a tile that left the screen before its turn", async () => {
    const paths = NAMES.flatMap(stack);
    const { assets, asked } = fakeWorkspace(paths);
    await assets.load();
    const leaves = NAMES.map((name) => assets.requestPicture(stack(name)));
    expect(asked.map(({ uri }) => uri)).toEqual(NAMES.slice(0, 8).map((name) => uri(`${P}/${name}.png`)));
    leaves[8]!();
    leaves[9]!();
    await answer(asked[0], "data:0");
    await answer(asked[1], "data:1");
    expect(asked.map(({ uri }) => uri).slice(8)).toEqual([uri(`${P}/${NAMES[10]}.png`), uri(`${P}/${NAMES[11]}.png`)]);
  });

  it("asks again when one of the picture's files changes or a layer is added, keeping the old answer for the old files", async () => {
    const { assets, asked, versions } = fakeWorkspace(stack("imani"));
    await assets.load();
    assets.requestPicture(stack("imani"));
    await answer(asked[0], "data:first");
    await compiled();
    await answer(asked[1], "data:first");
    const before = keyOf(stack("imani"));
    versions.set(`${P}/imani~face.happy~default.png`, 2);
    await assets.load();
    assets.requestPicture(stack("imani"));
    expect(asked).toHaveLength(3);
    await answer(asked[2], "data:replaced");
    versions.set(`${P}/imani~hat.on~default.png`, 1);
    await assets.load();
    const grown = [...stack("imani"), `${P}/imani~hat.on~default.png`];
    assets.requestPicture(grown);
    expect(asked).toHaveLength(4);
    await answer(asked[3], "data:grown");
    expect(workspace.assetPictures.value[before]).toBe("data:first");
    expect(workspace.assetPictures.value[keyOf(stack("imani"))]).toBe("data:replaced");
    expect(workspace.assetPictures.value[keyOf(grown)]).toBe("data:grown");
  });

  it("asks once more after the next compile when it first asked before the program knew the files, then no more", async () => {
    const { assets, asked } = fakeWorkspace(stack("imani"));
    await assets.load();
    assets.requestPicture(stack("imani"));
    await answer(asked[0], "data:before-compile");
    await compiled();
    expect(asked).toHaveLength(2);
    await answer(asked[1], "data:after-compile");
    await compiled();
    await compiled();
    expect(asked).toHaveLength(2);
    expect(workspace.assetPictures.value[keyOf(stack("imani"))]).toBe("data:after-compile");
  });

  it("asks after the next compile when the tile mounts again, not while it is off screen", async () => {
    const { assets, asked } = fakeWorkspace(stack("imani"));
    await assets.load();
    const leave = assets.requestPicture(stack("imani"));
    await answer(asked[0], "data:before-compile");
    leave();
    await compiled();
    expect(asked).toHaveLength(1);
    assets.requestPicture(stack("imani"));
    expect(asked).toHaveLength(2);
  });

  it("records no picture when the language server cannot draw one, so the tile keeps its base", async () => {
    const { assets, asked } = fakeWorkspace(stack("imani"));
    await assets.load();
    assets.requestPicture(stack("imani"));
    await answer(asked[0], null);
    expect(workspace.assetPictures.value).toEqual({ [keyOf(stack("imani"))]: null });
  });
});
