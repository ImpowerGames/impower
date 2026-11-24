import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const P = "file:///project/assets/Images/Portraits";
const base = `${P}/ava.png`;
const lids = `${P}/ava%20lids.on.png`;

const SCRIPT = `morph blink {
  blend = cut
  keyframes {
    from {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    to {
      lids {
        state = off
      }
    }
  }
}

scene start
  [[ava]]
end
`;

const image = (uri: string, width: number, height: number) => {
  const leaf = decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
  return { uri, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${leaf}`, version: 1, width, height };
};

const compile = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: SCRIPT, version: 1, languageId: "sparkdown" },
      image(base, 512, 768),
      image(lids, 480, 640),
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program as any;
};

function setup() {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  const sendRequest = vi.fn(async (_type: unknown, params: { command: string; arguments: string[] }) =>
    params.command === "sparkdown.getFileImageSize" ? { width: 480, height: 640 } : undefined,
  );
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.(png|svg)$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map(),
    _imageSizeRequests: new Set(),
    _imageSizesRead: new WeakSet(),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    _imageVocabularyCache: { prepare: (file: unknown) => file },
    _connection: { sendRequest },
    sendNotification: vi.fn(),
  });
  const publishes = () =>
    vi
      .mocked(workspace.sendNotification)
      .mock.calls.filter(([method]) => method === "textDocument/publishDiagnostics")
      .map(([, params]) => params as any);
  return { workspace, sendRequest, publishes };
}

const asked = (sendRequest: { mock: { calls: any[][] } }) =>
  sendRequest.mock.calls.filter(([, params]) => params.command === "sparkdown.getFileImageSize").map(([, params]) => params.arguments[0]);

function watch(workspace: SparkdownLanguageServerWorkspace) {
  const compilerRequests: { file: { uri?: string; width?: number; height?: number } }[] = [];
  const listed = { uri: lids, type: "image", name: "ava lids.on", ext: "png", src: "/src/lids", version: null };
  const sized = { ...image(base, 512, 768) };
  const svg = { uri: "file:///project/assets/face.svg", type: "image", name: "face", ext: "svg", version: null };
  const debouncedCompile = vi.fn(async () => undefined);
  Object.assign(workspace, {
    _watchedFiles: new Map<string, unknown>([[lids, listed], [base, sized], [svg.uri, svg], [main, { uri: main, type: "script", ext: "sd" }]]),
    _fileUpdatesByUri: new Map(),
    _fileUpdates: Promise.resolve(),
    _filesRevision: 0,
    _lastCompiledUri: main,
    projectLoaded: async () => undefined,
    compilerReady: async () => undefined,
    holdsScript: () => true,
    debouncedCompile,
    _compilerChannelConnection: {
      sendRequest: vi.fn(async (_type: unknown, params: { file: { uri?: string; width?: number; height?: number } }) => {
        compilerRequests.push(params);
      }),
    },
  });
  return { compilerRequests, debouncedCompile, svg };
}

describe("layer files of different pixel sizes in the language server (#2630)", () => {
  it("publishes the size warning on the layer file's own URI", () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: compile() } as any);
    const published = publishes().filter((params) => params.uri === lids);
    expect(published).toHaveLength(1);
    expect(published[0].diagnostics).toHaveLength(1);
    expect(published[0].diagnostics[0].severity).toBe(2);
    expect(published[0].diagnostics[0].message).toContain("480×640");
    expect(published[0].diagnostics[0].message).toContain("512×768");
    expect(publishes().some((params) => params.uri === base && params.diagnostics.length > 0)).toBe(false);
  });

  it("asks the host for a requested raster file's size and carries it on the file", async () => {
    const { workspace, sendRequest } = setup();
    (workspace as any)._imageSizeRequests = new Set([lids]);
    const file = await workspace.loadFile({ uri: lids });
    expect(sendRequest).toHaveBeenCalledWith(expect.anything(), { command: "sparkdown.getFileImageSize", arguments: [lids] });
    expect(file).toMatchObject({ uri: lids, width: 480, height: 640 });
  });

  it("does not ask the host for the size of a raster file the compiler did not request", async () => {
    const { workspace, sendRequest } = setup();
    const file = await workspace.loadFile({ uri: lids });
    expect(sendRequest.mock.calls.some(([, params]) => params.command === "sparkdown.getFileImageSize")).toBe(false);
    expect(file.width).toBeUndefined();
  });

  it("sizes the layer files a compiled program requests and recompiles", async () => {
    const { workspace, sendRequest } = setup();
    const { compilerRequests, debouncedCompile } = watch(workspace);
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    await vi.waitFor(() => expect(debouncedCompile).toHaveBeenCalledWith(main, true));
    expect(asked(sendRequest)).toEqual([lids]);
    expect((workspace as any)._watchedFiles.get(lids)).toMatchObject({ width: 480, height: 640 });
    expect(compilerRequests.map((request) => [request.file.uri, request.file.width, request.file.height])).toEqual([[lids, 480, 640]]);
  });

  it("does not ask the host for an SVG file's size", async () => {
    const { workspace, sendRequest } = setup();
    const svg = "file:///project/assets/face.svg";
    const file = await workspace.loadFile({ uri: svg });
    expect(sendRequest.mock.calls.some(([, params]) => params.command === "sparkdown.getFileImageSize")).toBe(false);
    expect(file.width).toBeUndefined();
  });
});

describe("the language server reads only the sizes the compiler requests (#2755)", () => {
  it("asks the host for nothing and does not recompile when a program requests no sizes", async () => {
    const { workspace, sendRequest } = setup();
    const { debouncedCompile } = watch(workspace);
    (workspace as any).requestImageSizes({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked(sendRequest)).toEqual([]);
    expect(debouncedCompile).not.toHaveBeenCalled();
  });

  it("does not ask for an SVG or an already-sized file even when requested", async () => {
    const { workspace, sendRequest } = setup();
    const { debouncedCompile, svg } = watch(workspace);
    (workspace as any).requestImageSizes({ imageSizeRequests: [svg.uri, base] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked(sendRequest)).toEqual([]);
    expect(debouncedCompile).not.toHaveBeenCalled();
  });

  it("asks once for a file that later compiles request again", async () => {
    const { workspace, sendRequest } = setup();
    sendRequest.mockImplementation(async () => null as never);
    const { debouncedCompile } = watch(workspace);
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked(sendRequest)).toEqual([lids]);
    expect(debouncedCompile).not.toHaveBeenCalled();
  });

  it("drops a size that arrives after the file stopped being requested, and asks again when it is requested again", async () => {
    const { workspace, sendRequest } = setup();
    let answer!: (size: { width: number; height: number }) => void;
    sendRequest.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve as never)) as never);
    const { compilerRequests, debouncedCompile } = watch(workspace);
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    (workspace as any).requestImageSizes({});
    answer({ width: 480, height: 640 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((workspace as any)._watchedFiles.get(lids).width).toBeUndefined();
    expect(compilerRequests).toEqual([]);
    expect(debouncedCompile).not.toHaveBeenCalled();
    (workspace as any).requestImageSizes({ imageSizeRequests: [lids] });
    await vi.waitFor(() => expect(debouncedCompile).toHaveBeenCalledWith(main, true));
    expect(asked(sendRequest)).toEqual([lids, lids]);
  });
});
