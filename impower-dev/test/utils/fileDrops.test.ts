import { describe, expect, it } from "vitest";
import { droppedItems, walkDrop } from "../../src/modules/spark-editor/utils/fileDrops";

type Entry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (file: File) => void, fail: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (error: unknown) => void) => void };
};

const fileEntry = (name: string, size = 1, unreadable = false): Entry => ({
  name,
  isFile: true,
  isDirectory: false,
  file: (ok, fail) =>
    setTimeout(() => (unreadable ? fail(new DOMException("gone", "NotFoundError")) : ok(new File([new Uint8Array(size)], name)))),
});

const folderEntry = (name: string, pages: Entry[][], { failOnPage }: { failOnPage?: number } = {}) => {
  const reads: number[] = [];
  const entry: Entry & { reads: number[] } = {
    name,
    isFile: false,
    isDirectory: true,
    reads,
    createReader: () => {
      let page = 0;
      return {
        readEntries: (ok, fail) =>
          setTimeout(() => {
            reads.push(page);
            if (page === failOnPage) {
              fail(new DOMException("denied", "NotReadableError"));
              return;
            }
            ok(pages[page++] ?? []);
          }),
      };
    },
  };
  return entry;
};

const asFolder = (entry: Entry) => ({ folder: entry as unknown as FileSystemDirectoryEntry });

const loose = (name: string, size = 1) => ({ name, size, getBuffer: async () => new ArrayBuffer(size) });

describe("walking a drop's folders into the upload path's entry list", () => {
  it("lists every file inside nested folders under the dropped folder's name, reading each folder until it returns no more", async () => {
    const strings = folderEntry("Strings", [[fileEntry("violin.ogg", 5)], [fileEntry("cello.ogg", 7)]]);
    const music = folderEntry("Music", [[fileEntry("theme.mp3", 3), strings], [fileEntry("rain.wav", 2)], []]);
    const walked = await walkDrop([asFolder(music)]);
    expect(walked.files.map((file) => [file.name, file.size])).toEqual([
      ["Music/theme.mp3", 3],
      ["Music/rain.wav", 2],
      ["Music/Strings/violin.ogg", 5],
      ["Music/Strings/cello.ogg", 7],
    ]);
    expect(walked.refused).toEqual([]);
    expect(music.reads).toEqual([0, 1, 2]);
    expect(strings.reads).toEqual([0, 1, 2]);
  });

  it("skips hidden files and folders and the operating system's droppings inside a folder", async () => {
    const git = folderEntry(".git", [[fileEntry("HEAD")]]);
    const mac = folderEntry("__MACOSX", [[fileEntry("._hero.png")]]);
    const art = folderEntry("Art", [
      [fileEntry("hero.png"), fileEntry(".DS_Store"), fileEntry("Thumbs.db"), fileEntry("desktop.ini"), fileEntry(".hidden.png"), git, mac],
    ]);
    const walked = await walkDrop([asFolder(art)]);
    expect(walked.files.map((file) => file.name)).toEqual(["Art/hero.png"]);
    expect(git.reads).toEqual([]);
    expect(mac.reads).toEqual([]);
  });

  it("keeps loose files and several folders dropped together in the order they were dropped", async () => {
    const one = folderEntry("One", [[fileEntry("a.png")]]);
    const two = folderEntry("Two", [[fileEntry("b.png")]]);
    const walked = await walkDrop([loose("intro.ogg"), asFolder(one), loose("outro.ogg"), asFolder(two)]);
    expect(walked.files.map((file) => file.name)).toEqual(["intro.ogg", "One/a.png", "outro.ogg", "Two/b.png"]);
  });

  it("gives an empty folder, an unreadable folder and an unreadable file each a not-added entry with its reason", async () => {
    const empty = folderEntry("Empty", [[folderEntry("Nothing", [])]]);
    const locked = folderEntry("Locked", [[fileEntry("kept.png")]], { failOnPage: 1 });
    const broken = folderEntry("Broken", [[fileEntry("link.png", 1, true), fileEntry("fine.png")]]);
    const walked = await walkDrop([asFolder(empty), asFolder(locked), asFolder(broken)]);
    expect(walked.files.map((file) => file.name)).toEqual(["Locked/kept.png", "Broken/fine.png"]);
    expect(walked.refused).toEqual([
      { name: "Empty", reason: { kind: "empty_folder" } },
      { name: "Locked", reason: { kind: "unreadable_folder" } },
      { name: "link.png", reason: { kind: "unreadable" } },
    ]);
  });

  it("walks in steps, reporting the files found so far after each page so the page keeps drawing", async () => {
    const pages = Array.from({ length: 5 }, (_, page) => Array.from({ length: 100 }, (_, at) => fileEntry(`${page}-${at}.ogg`)));
    const found: number[] = [];
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 0);
    const walked = await walkDrop([asFolder(folderEntry("Big", pages))], (count) => found.push(count));
    clearInterval(ticker);
    expect(walked.files).toHaveLength(500);
    expect(found).toEqual([100, 200, 300, 400, 500]);
    expect(ticks).toBeGreaterThan(0);
  });
});

describe("reading a drop's items", () => {
  const event = (items: object[], files: File[] = []) => ({ dataTransfer: { items, files } }) as unknown as DragEvent;

  it("takes each dropped folder as a folder to walk and each dropped file as a file", () => {
    const music = folderEntry("Music", []);
    const theme = new File([new Uint8Array(4)], "theme.mp3");
    const items = droppedItems(
      event([
        { kind: "file", webkitGetAsEntry: () => music, getAsFile: () => null },
        { kind: "file", webkitGetAsEntry: () => fileEntry("theme.mp3"), getAsFile: () => theme },
        { kind: "string", webkitGetAsEntry: () => null, getAsFile: () => null },
      ]),
    );
    expect(items).toEqual([{ folder: music }, expect.objectContaining({ name: "theme.mp3", size: 4 })]);
  });

  it("falls back to the dropped files where the browser gives no items", () => {
    const theme = new File([new Uint8Array(4)], "theme.mp3");
    const items = droppedItems({ dataTransfer: { files: [theme] } } as unknown as DragEvent);
    expect(items).toEqual([expect.objectContaining({ name: "theme.mp3", size: 4 })]);
  });
});
