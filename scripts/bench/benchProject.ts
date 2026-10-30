import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ImageVocabularyCache, imageFileForCompiler } from "../../packages/sparkdown/src/workspace/utils/prepareImageFile";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";

const SCRIPT_RE = /\.sd$/i;
const IMAGE_RE = /\.(png|apng|jpeg|jpg|gif|bmp|svg|webp)$/i;
const AUDIO_RE = /\.(mid|wav|mp3|mp2|ogg|aac|opus|flac)$/i;
const FONT_RE = /\.(ttf|woff|woff2|otf)$/i;

export const MAIN_URI = "file:///local/main.sd";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function loadProjectFiles(project: string) {
  const vocab = new ImageVocabularyCache();
  const files: any[] = [];
  for (const full of walk(project)) {
    const rel = path.relative(project, full).split(path.sep).join("/");
    const filename = rel.split("/").at(-1)!;
    const dot = filename.lastIndexOf(".");
    const ext = dot < 0 ? "" : filename.slice(dot + 1);
    const type = SCRIPT_RE.test(rel) ? "script" : IMAGE_RE.test(rel) ? "image" : AUDIO_RE.test(rel) ? "audio" : FONT_RE.test(rel) ? "font" : "";
    const stat = fs.statSync(full);
    const needsText = type === "script" || ext.toLowerCase() === "svg";
    const prepared = vocab.prepare({
      uri: "file:///local/" + rel,
      name: filename.split(".")[0]!,
      ext,
      type,
      src: `/file:/local/${rel}?v=${Math.floor(stat.mtimeMs)}-${stat.size}`,
      text: needsText ? fs.readFileSync(full, "utf8") : undefined,
      version: type === "script" ? 1 : Math.floor(stat.mtimeMs),
      languageId: type === "script" ? "sparkdown" : undefined,
    } as any);
    files.push(imageFileForCompiler(prepared, true));
  }
  return files;
}

export function configurePlayerCompiler(compiler: SparkdownCompiler, files: any[], startFrom: { file: string; line: number }, extra: Record<string, unknown> = {}) {
  compiler.configure({
    files,
    definitions: {
      optionals: DEFAULT_OPTIONAL_DEFINITIONS,
      schemas: DEFAULT_SCHEMA_DEFINITIONS,
      descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
    },
    skipValidation: true,
    stripImageData: true,
    workspace: "file:///local",
    startFrom,
    seedBuiltinsIntoStory: true,
    ...extra,
  } as any);
}

export const benchSystem = {
  now: () => performance.now(),
  setTimeout: (h: any, t?: number, ...a: any[]) => setTimeout(h, t, ...a) as any,
  resolve: (p: string) => p,
  fetch: async () => "",
  log: () => {},
};

export const stats = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s.at(-1) ?? 0 };
};

export function silenceConsole() {
  const realLog = console.log;
  console.log = console.warn = console.error = console.info = console.debug = () => {};
  return realLog;
}
