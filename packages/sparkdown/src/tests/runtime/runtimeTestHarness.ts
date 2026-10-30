import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { testCompiler, testStory, type TestStory } from "../engineUnderTest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "fixtures");

export interface RuntimeTestContext {
  story: TestStory;
  errorMessages: string[];
  warningMessages: string[];
  root: ProgramRoot;
}

export function makeRuntimeStoryFromFile(
  feature: string,
  name: string,
): RuntimeTestContext {
  const path = join(FIXTURE_ROOT, feature, `${name}.sd`);
  const source = readFileSync(path, "utf8");
  return makeRuntimeStoryFromSource(source, `inmemory://${feature}/${name}.sd`);
}

export function makeRuntimeStoryFromDirectory(
  feature: string,
  name: string,
): RuntimeTestContext {
  const fixtureRoot = join(FIXTURE_ROOT, feature, name);
  const files = collectSparkdownFiles(fixtureRoot);
  const baseUri = `inmemory://${feature}/${name}/`;
  const mainUri = `${baseUri}main.sd`;

  const compiler = testCompiler();
  compiler.configure({
    files: files.map((f) => ({
      uri: `${baseUri}${f.relativePath}`,
      type: "script",
      name: f.relativePath.replace(/\.sd$/, ""),
      ext: "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });

  return runCompiledStory(compiler, mainUri);
}

interface FixtureFile {
  relativePath: string;
  text: string;
}

function collectSparkdownFiles(root: string): FixtureFile[] {
  const files: FixtureFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const stats = statSync(abs);
      if (stats.isDirectory()) {
        walk(abs);
      } else if (entry.endsWith(".sd")) {
        const relativePath = relative(root, abs).split(sep).join("/");
        files.push({
          relativePath,
          text: readFileSync(abs, "utf8"),
        });
      }
    }
  };
  walk(root);
  return files;
}

export function makeRuntimeStoryFromSource(
  source: string,
  uri: string = "inmemory:///main.sd",
): RuntimeTestContext {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return runCompiledStory(compiler, uri);
}

function runCompiledStory(
  compiler: SparkdownCompiler,
  uri: string,
): RuntimeTestContext {
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];

  const result = compiler.compile({ textDocument: { uri } });
  const program = result.program;

  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const diag of docDiagnostics) {
      let message: string;
      if (typeof diag === "string") {
        message = diag;
      } else {
        const raw = (diag as { message?: unknown }).message;
        if (typeof raw === "string") {
          message = raw;
        } else if (
          raw &&
          typeof (raw as { value?: unknown }).value === "string"
        ) {
          message = (raw as { value: string }).value;
        } else {
          message = JSON.stringify(diag);
        }
      }
      const severity = (diag as { severity?: number }).severity;
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else if (severity === 3 || severity === 4) {
      } else errorMessages.push(message);
    }
  }

  if (!program.chunks) {
    throw new Error(
      `Sparkdown compilation built no statement chunks.\n` +
        `Errors:\n  ${errorMessages.join("\n  ") || "(none)"}\n` +
        `Warnings:\n  ${warningMessages.join("\n  ") || "(none)"}`,
    );
  }

  const story = testStory(program.chunks);
  return {
    story,
    errorMessages,
    warningMessages,
    root: program.chunks,
  };
}

export function collectDiagnostics(
  source: string,
  uri: string = "inmemory:///main.sd",
): { errorMessages: string[]; warningMessages: string[] } {
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  for (const docDiagnostics of Object.values(
    result.program.diagnostics ?? {},
  )) {
    for (const diag of docDiagnostics) {
      let message: string;
      if (typeof diag === "string") {
        message = diag;
      } else {
        const raw = (diag as { message?: unknown }).message;
        if (typeof raw === "string") message = raw;
        else if (raw && typeof (raw as { value?: unknown }).value === "string")
          message = (raw as { value: string }).value;
        else message = JSON.stringify(diag);
      }
      const severity = (diag as { severity?: number }).severity;
      if (severity === 1) errorMessages.push(message);
      else if (severity === 2) warningMessages.push(message);
      else errorMessages.push(message);
    }
  }
  return { errorMessages, warningMessages };
}

export function visitCountOf(story: TestStory, name: string): number {
  const entries = (
    story.state as unknown as { GetVisitCountEntries(): [string, number][] }
  ).GetVisitCountEntries();
  return entries.find(([key]) => key === name)?.[1] ?? 0;
}

export function collectDiagnosticsFromFile(
  feature: string,
  name: string,
): { errorMessages: string[]; warningMessages: string[] } {
  const path = join(FIXTURE_ROOT, feature, `${name}.sd`);
  return collectDiagnostics(
    readFileSync(path, "utf8"),
    `inmemory://${feature}/${name}.sd`,
  );
}

export function runToEnd(story: TestStory): string {
  return story.ContinueMaximally();
}

export function continueShowedSomething(story: TestStory): boolean {
  return story.continueShowedSomething;
}

export function displayRouting(
  story: TestStory,
): { target?: string; character?: string }[] {
  return story.currentDisplayInstructions.map((table) => {
    const routing: { target?: string; character?: string } = {};
    for (const key of ["target", "character"] as const) {
      const value = (table.value?.get(key) as { value?: unknown } | undefined)
        ?.value;
      if (typeof value === "string") routing[key] = value;
    }
    return routing;
  });
}
