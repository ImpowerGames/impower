import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({
  notifications: [] as { method: string; params: unknown }[],
}));
vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: () => ({
    onRequest: () => {},
    onNotification: () => {},
    onClose: () => {},
    listen: () => {},
    sendRequest: async () => ({ capabilities: {} }),
    sendNotification: (method: string, params: unknown) => {
      connection.notifications.push({ method, params });
    },
  }),
}));

import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  buildZippable,
  parseUnzipEntries,
} from "../../../packages/opfs-workspace/src/utils/assetArchive";
import extensionManifest from "../../../vscode-sparkdown/package.json";
import {
  extensionDefaults,
  projectSettingsFromJson,
  projectSettingsJson,
  SETTINGS_JSON_PATH,
} from "../../src/modules/spark-editor/workspace/settings/settingsJson";
import {
  PROJECT_SETTINGS_SCHEMA,
  type ProjectSettings,
  type SettingSpec,
  type SettingValue,
} from "../../src/modules/spark-editor/workspace/settings/settingsSchema";
import workspaceSettings, {
  PREFERENCES_STORAGE_KEY,
  WorkspaceSettings,
} from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";
import { useSettings } from "../../src/modules/spark-editor/workspace/settings/useSettings";
import WorkspaceConfiguration from "../../src/modules/spark-editor/workspace/WorkspaceConfiguration";
import WorkspaceFileSystem from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";
import WorkspaceLanguageServer from "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer";

const DID_CHANGE_CONFIGURATION = "workspace/didChangeConfiguration";

const defaultsOf = (): ProjectSettings =>
  Object.fromEntries(
    Object.entries(PROJECT_SETTINGS_SCHEMA).map(([key, spec]) => [
      key,
      spec.default,
    ]),
  ) as ProjectSettings;

const otherThanDefault = (spec: SettingSpec): SettingValue => {
  if (spec.choices) {
    return spec.choices.find((choice) => choice !== spec.default)!;
  }
  if (typeof spec.default === "boolean") {
    return !spec.default;
  }
  if (typeof spec.default === "number") {
    return spec.default + 1;
  }
  return `${spec.default} changed`;
};

const reload = (projectId: string) =>
  new WorkspaceSettings(signal(projectId), localStorage);

describe("the settings store", () => {
  let stores: WorkspaceSettings[] = [];
  const open = (projectId: string) => {
    const store = reload(projectId);
    stores.push(store);
    return store;
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    stores.forEach((store) => store.dispose());
    stores = [];
  });

  it("reads each key's default when storage holds nothing", () => {
    const store = open("p1");
    expect(store.preferences.value.theme).toBe("automatic");
    expect(store.projectSettings.value).toEqual(defaultsOf());
  });

  it("keeps a preference across a reload", () => {
    open("p1").setPreference("theme", "chalk");
    expect(open("p1").preferences.value.theme).toBe("chalk");
    expect(open("p2").preferences.value.theme).toBe("chalk");
  });

  it("keeps a project setting with its project only", () => {
    const projectId = signal("p1");
    const store = new WorkspaceSettings(projectId, localStorage);
    stores.push(store);
    store.setProjectSetting("screenplayPaperSize", "a4");
    expect(open("p1").projectSettings.value.screenplayPaperSize).toBe("a4");
    projectId.value = "p2";
    expect(store.projectSettings.value.screenplayPaperSize).toBe("usletter");
    projectId.value = "p1";
    expect(store.projectSettings.value.screenplayPaperSize).toBe("a4");
  });

  it("reads the default for a stored value of the wrong type or choice", () => {
    localStorage.setItem(
      "settings/project/p1",
      JSON.stringify({ screenplayTitlePage: "yes", screenplaySceneNumbers: "top" }),
    );
    const store = open("p1");
    expect(store.projectSettings.value.screenplayTitlePage).toBe(true);
    expect(store.projectSettings.value.screenplaySceneNumbers).toBe("none");
  });

  it("refuses a value the schema does not allow", () => {
    const store = open("p1");
    expect(() =>
      store.setProjectSetting("screenplaySceneNumbers", "top" as "none"),
    ).toThrow(TypeError);
    expect(() => store.setPreference("theme", 3 as unknown as string)).toThrow(
      TypeError,
    );
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it("keeps a key it does not know when it saves", () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ fromANewerVersion: [1, 2] }),
    );
    open("p1").setPreference("theme", "chalk");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({
      fromANewerVersion: [1, 2],
      theme: "chalk",
    });
  });

  it("hands the sparkdown section to its subscribers on each change", () => {
    const store = open("p1");
    const received: unknown[] = [];
    store.onDidChangeConfiguration((params) => received.push(params.settings));
    store.setProjectSetting("imageFiles", "*.{png}");
    store.setProjectSetting("screenplayKnotNames", true);
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({
      imageFiles: "*.{png}",
      screenplay: {
        markup: { printKnotIdentifiers: true, printStitchIdentifiers: true },
      },
    });
  });
});

describe("useSettings", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    act(() => render(null, host));
    host.remove();
  });

  it("reports a preference and a project setting as they change", () => {
    const Probe = () => {
      const { preferences, projectSettings } = useSettings();
      return h(
        "span",
        null,
        `${preferences.theme} ${projectSettings.screenplayPaperSize}`,
      );
    };
    act(() => render(h(Probe, {}), host));
    expect(host.textContent).toBe("automatic usletter");
    act(() => {
      workspaceSettings.setPreference("theme", "chalk");
      workspaceSettings.setProjectSetting("screenplayPaperSize", "a4");
    });
    expect(host.textContent).toBe("chalk a4");
  });
});

describe("the change notification", () => {
  let store: WorkspaceSettings;
  let configuration: WorkspaceConfiguration;
  const posted: unknown[] = [];
  const protocol: unknown[] = [];
  const onProtocol = (e: Event) => {
    protocol.push((e as CustomEvent).detail);
  };

  beforeEach(() => {
    localStorage.clear();
    posted.length = 0;
    protocol.length = 0;
    connection.notifications.length = 0;
    vi.stubGlobal(
      "Worker",
      class {
        onerror: unknown;
        addEventListener() {}
        postMessage(message: unknown) {
          posted.push(message);
        }
      },
    );
    window.addEventListener(MessageProtocol.event, onProtocol);
    store = new WorkspaceSettings(signal("p1"), localStorage);
    configuration = new WorkspaceConfiguration(store);
  });

  afterEach(() => {
    window.removeEventListener(MessageProtocol.event, onProtocol);
    store.dispose();
    vi.unstubAllGlobals();
  });

  it("reaches the language server, the file-system worker and the player bridge", async () => {
    const ls = new WorkspaceLanguageServer({
      configuration,
      window: { getOpenedDocumentUri: () => undefined } as never,
    });
    new WorkspaceFileSystem(ls, configuration);
    await ls.start("file://p1", []);

    store.setProjectSetting("audioFiles", "*.{ogg}");

    const expected = expect.objectContaining({
      audioFiles: "*.{ogg}",
      scriptFiles: PROJECT_SETTINGS_SCHEMA.scriptFiles.default,
    });
    expect(
      connection.notifications.filter((n) => n.method === DID_CHANGE_CONFIGURATION),
    ).toEqual([
      { method: DID_CHANGE_CONFIGURATION, params: { settings: expected } },
    ]);
    expect(
      posted.filter(
        (m) => (m as { method?: string }).method === DID_CHANGE_CONFIGURATION,
      ),
    ).toEqual([
      expect.objectContaining({
        method: DID_CHANGE_CONFIGURATION,
        params: { settings: expected },
      }),
    ]);
    expect(
      protocol.filter(
        (m) => (m as { method?: string }).method === DID_CHANGE_CONFIGURATION,
      ),
    ).toEqual([
      expect.objectContaining({
        method: DID_CHANGE_CONFIGURATION,
        params: { settings: expected },
      }),
    ]);
  });

  it("is what the language server and the worker read when they ask for the sparkdown section", () => {
    store.setProjectSetting("fontFiles", "*.{otf}");
    expect(configuration.settings).toMatchObject({ fontFiles: "*.{otf}" });
  });

  it("is not sent to a language server that has not initialized", () => {
    new WorkspaceLanguageServer({
      configuration,
      window: { getOpenedDocumentUri: () => undefined } as never,
    });
    store.setPreference("theme", "chalk");
    expect(connection.notifications).toEqual([]);
  });
});

const PROJECT = "proj1";
const dec = new TextDecoder();
const enc = new TextEncoder();

const zipHarness = (initial: Record<string, string>) => {
  const opfs = new Map<string, Uint8Array>(
    Object.entries(initial).map(([path, text]) => [
      `file:///${PROJECT}/${path}`,
      enc.encode(text),
    ]),
  );
  const files = () =>
    Object.fromEntries(
      [...opfs.keys()].map((uri) => {
        const base = uri.split("/").pop()!;
        const dot = base.lastIndexOf(".");
        return [
          uri,
          {
            uri,
            name: dot > 0 ? base.slice(0, dot) : base,
            ext: dot > 0 ? base.slice(dot + 1) : "",
          },
        ];
      }),
    );
  const fs = {
    getDirectoryUri: WorkspaceFileSystem.prototype.getDirectoryUri,
    getFileUri: WorkspaceFileSystem.prototype.getFileUri,
    getRelativePath: WorkspaceFileSystem.prototype.getRelativePath,
    _scheme: "file:///",
    getFiles: async () => files(),
    getFolders: async () => [],
    listFolders: async () => [],
    createFolders: async () => [],
    deleteFolders: async () => [],
    writeProjectMetadata: async () => {},
    foldersOutside: (WorkspaceFileSystem.prototype as any).foldersOutside,
    replaceFolders: (WorkspaceFileSystem.prototype as any).replaceFolders,
    _unstoredUris: new Set<string>(),
    zipFiles: async ({
      files: list,
      entries = [],
    }: {
      files: { uri: string; path: string }[];
      entries?: { path: string; data: ArrayBuffer }[];
    }) =>
      zipSync(
        buildZippable([
          ...list.map(({ uri, path }) => ({ path, data: opfs.get(uri)! })),
          ...entries,
        ]),
      ).buffer,
    unzipFiles: async ({ data }: { data: ArrayBuffer }) =>
      parseUnzipEntries(unzipSync(new Uint8Array(data))),
    createFiles: async ({
      files: list,
    }: {
      files: { uri: string; data: ArrayBuffer }[];
    }) => {
      for (const { uri, data } of list) {
        opfs.set(uri, new Uint8Array(data));
      }
    },
    deleteFiles: async ({ files: list }: { files: { uri: string }[] }) => {
      for (const { uri } of list) {
        opfs.delete(uri);
      }
    },
  };
  return {
    opfs,
    paths: () =>
      [...opfs.keys()].map((uri) => uri.slice(`file:///${PROJECT}/`.length)),
    readProjectZip: (settingsJson?: string) =>
      WorkspaceFileSystem.prototype.readProjectZip.call(
        fs,
        PROJECT,
        settingsJson,
      ),
    writeProjectZip: (content: ArrayBuffer) =>
      WorkspaceFileSystem.prototype.writeProjectZip.call(fs, PROJECT, content),
  };
};

const zipEntries = (zip: ArrayBuffer) =>
  Object.fromEntries(
    Object.entries(unzipSync(new Uint8Array(zip))).map(([path, data]) => [
      path,
      dec.decode(data),
    ]),
  );

describe(".vscode/settings.json", () => {
  const defaults = extensionDefaults(extensionManifest);

  it("writes every project setting but branch names, under a key the extension declares with the same default", () => {
    expect(projectSettingsJson(defaultsOf(), defaults)).toBeUndefined();
    expect(
      Object.entries(PROJECT_SETTINGS_SCHEMA)
        .filter(([, spec]) => (spec.configurationKeys ?? []).length === 0)
        .map(([key]) => key),
    ).toEqual(["screenplayBranchNames"]);
    for (const [key, spec] of Object.entries(PROJECT_SETTINGS_SCHEMA)) {
      for (const path of spec.configurationKeys ?? []) {
        expect(Object.hasOwn(defaults, `sparkdown.${path}`), path).toBe(true);
        expect(defaults[`sparkdown.${path}`], key).toBe(spec.default);
      }
    }
  });

  it("is written into an export with exactly the one changed screenplay key", async () => {
    const harness = zipHarness({ "main.sd": "Hello" });
    const settings = { ...defaultsOf(), screenplayPaperSize: "a4" as const };
    const zip = await harness.readProjectZip(
      projectSettingsJson(settings, defaults),
    );
    const entries = zipEntries(zip);
    expect(Object.keys(entries).sort()).toEqual([SETTINGS_JSON_PATH, "main.sd"]);
    expect(JSON.parse(entries[SETTINGS_JSON_PATH]!)).toEqual({
      "sparkdown.screenplay.pdf.printPaperSize": "a4",
    });
  });

  it("is left out of an export whose settings are all defaults", async () => {
    const harness = zipHarness({
      "main.sd": "Hello",
      [SETTINGS_JSON_PATH]: '{ "sparkdown.screenplay.pdf.printPaperSize": "a4" }',
    });
    const zip = await harness.readProjectZip(
      projectSettingsJson(defaultsOf(), defaults),
    );
    expect(Object.keys(zipEntries(zip))).toEqual(["main.sd"]);
  });

  it("seeds a known key on import, ignores an unknown one and writes no file for it", async () => {
    const harness = zipHarness({ "main.sd": "Old" });
    const text = [
      "{",
      "  // chosen in VS Code",
      '  "sparkdown.screenplay.numbering.printSceneNumbers": "both",',
      '  "editor.fontSize": 18,',
      "}",
    ].join("\n");
    const zip = zipSync(
      buildZippable([
        { path: "main.sd", data: enc.encode("New") },
        { path: SETTINGS_JSON_PATH, data: enc.encode(text) },
      ]),
    ).buffer as ArrayBuffer;

    const imported = await harness.writeProjectZip(zip);

    expect(harness.paths()).toEqual(["main.sd"]);
    expect(dec.decode(harness.opfs.get(`file:///${PROJECT}/main.sd`))).toBe(
      "New",
    );
    expect(projectSettingsFromJson(imported!)).toEqual({
      screenplaySceneNumbers: "both",
    });

    localStorage.clear();
    const store = new WorkspaceSettings(signal(PROJECT), localStorage);
    store.replaceProjectSettings(PROJECT, projectSettingsFromJson(imported!));
    expect(store.projectSettings.value).toEqual({
      ...defaultsOf(),
      screenplaySceneNumbers: "both",
    });
    store.dispose();
  });

  it("round-trips every setting it writes, each changed from its default", async () => {
    const changed = Object.fromEntries(
      Object.entries(PROJECT_SETTINGS_SCHEMA)
        .filter(([, spec]) => (spec.configurationKeys ?? []).length > 0)
        .map(([key, spec]) => [key, otherThanDefault(spec)]),
    ) as Partial<ProjectSettings>;
    const harness = zipHarness({ "main.sd": "Hello" });
    const zip = await harness.readProjectZip(
      projectSettingsJson({ ...defaultsOf(), ...changed }, defaults),
    );
    const imported = await zipHarness({}).writeProjectZip(zip);
    expect(projectSettingsFromJson(imported!)).toEqual(changed);
  });

  it("is ignored when it is not an object of settings", () => {
    expect(projectSettingsFromJson("[1, 2]")).toEqual({});
    expect(projectSettingsFromJson("not json")).toEqual({});
    expect(
      projectSettingsFromJson(
        '{ "sparkdown.screenplay.pdf.printPaperSize": "legal", "url": "http://x//y" }',
      ),
    ).toEqual({});
  });
});
