import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const deleted: string[] = [];

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFiles: async () =>
        Object.fromEntries(
          [...files.entries()].map(([rel, src]) => [`file:///p/${rel}`, { src }]),
        ),
      getRelativePath: (_projectId: string, uri: string) => uri.slice("file:///p/".length),
      getFileUri: (_projectId: string, rel: string) => `file:///p/${rel}`,
      deleteFiles: async ({ files: gone }: { files: { uri: string }[] }) => {
        deleted.push(...gone.map((f) => f.uri.slice("file:///p/".length)));
      },
    },
  },
}));

const { conflictRequest, resolveUploadConflicts } = await import(
  "../../src/modules/spark-editor/utils/uploadConflicts"
);
const { setAssetFiles } = await import("../../src/modules/spark-editor/utils/assetTypes");
const { PROJECT_SETTINGS_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);

const KINDS = [
  { kind: "image", folder: "Assets/Images", name: "subway", ext: "png", other: "jpg" },
  { kind: "audio", folder: "Assets/Audio", name: "fx_rain_thin", ext: "wav", other: "mp3" },
  { kind: "video", folder: "Assets/Video", name: "intro", ext: "mp4", other: "webm" },
  { kind: "text", folder: "Assets/Text", name: "notes", ext: "txt", other: "md" },
  { kind: "font", folder: "Assets/Fonts", name: "Inter", ext: "ttf", other: "woff2" },
] as const;

type Kind = (typeof KINDS)[number];

const ROUTES = {
  "upload, same file name": (k: Kind) => ({ rel: `${k.folder}/${k.name}.${k.ext}` }),
  "upload, other extension": (k: Kind) => ({ rel: `${k.folder}/${k.name}.${k.other}` }),
  "link by address": (k: Kind) => ({
    rel: `${k.folder}/${k.name}.url`,
    address: `https://cdn.example.com/${k.name}.${k.other}`,
  }),
} as const;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function add(item: { rel: string; address?: string }, action: "skip" | "keepboth" | "replace") {
  const done = resolveUploadConflicts("p", [{ ...item, payload: null }], async (r) =>
    r.survivors.map((s) => s.uri.slice("file:///p/".length)),
  );
  await settle();
  const request = conflictRequest.peek();
  request?.resolve({ action, applyToAll: false });
  conflictRequest.value = null;
  return { request, written: await done };
}

beforeEach(() => {
  files.clear();
  deleted.length = 0;
  conflictRequest.value = null;
  setAssetFiles({
    imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
    audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
    videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
    fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
  });
});

describe.each(KINDS)("adding a $kind whose name is taken", (k) => {
  const existing = `${k.folder}/${k.name}.${k.ext}`;

  describe.each(Object.entries(ROUTES))("by %s", (_route, itemOf) => {
    beforeEach(() => {
      files.set(existing, `/src/${existing}`);
    });

    it("asks about the existing file, and Skip adds nothing", async () => {
      const { request, written } = await add(itemOf(k), "skip");
      expect(request?.name).toBe(`${k.name}.${k.ext}`);
      expect(request?.location).toBe(`${k.folder}/`);
      expect(written).toEqual([]);
      expect(deleted).toEqual([]);
    });

    it("Keep both adds it under a name no other asset of the type has", async () => {
      const item = itemOf(k);
      const { request, written } = await add(item, "keepboth");
      expect(request).not.toBeNull();
      const ext = item.rel.slice(item.rel.lastIndexOf("."));
      expect(written).toEqual([`${k.folder}/${k.name}01${ext}`]);
      expect(deleted).toEqual([]);
    });

    it("Replace moves the existing file to the recycle bin and adds it", async () => {
      const item = itemOf(k);
      const { request, written } = await add(item, "replace");
      expect(request).not.toBeNull();
      expect(written).toEqual([item.rel]);
      expect(deleted).toEqual([existing]);
    });
  });

  describe.each(Object.entries(ROUTES))("by %s, when the name is taken in another folder", (_route, itemOf) => {
    const elsewhere = `${k.folder}/Existing/${k.name}.${k.ext}`;
    beforeEach(() => {
      files.set(elsewhere, `/src/${elsewhere}`);
    });

    it("asks about that file, and Skip adds nothing", async () => {
      const { request, written } = await add(itemOf(k), "skip");
      expect(request?.name).toBe(`${k.name}.${k.ext}`);
      expect(request?.location).toBe(`${k.folder}/Existing/`);
      expect(written).toEqual([]);
    });

    it("Keep both adds it under a name no other asset of the type has", async () => {
      const item = itemOf(k);
      const { written } = await add(item, "keepboth");
      const ext = item.rel.slice(item.rel.lastIndexOf("."));
      expect(written).toEqual([`${k.folder}/${k.name}01${ext}`]);
      expect(deleted).toEqual([]);
    });

    it("Replace moves that file to the recycle bin and adds it where it was added", async () => {
      const item = itemOf(k);
      const { written } = await add(item, "replace");
      expect(written).toEqual([item.rel]);
      expect(deleted).toEqual([elsewhere]);
    });
  });

  it("asks when a file is added with the name of an existing link", async () => {
    const link = `${k.folder}/${k.name}.url`;
    files.set(link, `https://cdn.example.com/${k.name}.${k.other}`);
    const { request } = await add({ rel: existing }, "skip");
    expect(request?.name).toBe(`${k.name}.url`);
  });

  it("adds without asking when no asset of the type has the name", async () => {
    files.set(`${k.folder}/other.${k.ext}`, "/src/other");
    const { request, written } = await add(ROUTES["link by address"](k), "skip");
    expect(request).toBeNull();
    expect(written).toEqual([`${k.folder}/${k.name}.url`]);
  });
});
