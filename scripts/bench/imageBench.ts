// A route search node's cost on the program engine (#699): an image of the
// engine's state against the JSON round trip of the whole state.
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, candidate, samples, warmup,
// json }. A candidate is how a search node holds the state it runs from:
// `json`, the state as `story.state.toJson()` writes it, claimed by the hash of
// that text and loaded back with `LoadJson`, as the route planner held it; or
// `image`, an image the engine takes (`ProgramStory.capture`), claimed by its
// digest (`imageDigest`) and restored in place (`ProgramStory.restore`). Each
// candidate runs scene MAIN of the chunks scene from its top to its end on the
// program engine, taking the first choice whenever the story stops at one, and
// after every line does what a search node and its sibling do: forks the state
// and claims the fork site by the state's key, runs on to the next line and
// forks there, and restores the first fork to run the sibling from it, so that
// a restore undoes a run as a sibling's does. Only the forks and the restores
// are timed. Each reports a digest of every line it produced, which
// engine-bench.mjs requires to be equal, so that neither candidate changed what
// the story did.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { extendSeq } from "../../packages/sparkdown/src/compiler/utils/planRoute";
import { imageDigest, type ProgramImage } from "../../packages/sparkdown/src/program/ProgramImages";
import { ProgramStory } from "../../packages/sparkdown/src/program/ProgramStory";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface ImageBenchConfig {
  project: string;
  candidate: "json" | "image";
  samples: number;
  warmup: number;
  json?: string;
}

const config: ImageBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const SCENE = "MAIN";

interface Run {
  lines: string[];
  nodes: number;
  nodeMs: number;
  keys: number;
  /** What the images held, summed over the nodes: whole state for the JSON
   *  candidate is its length in characters. */
  held: number;
}

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: 0 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom, {
    programChunks: true,
  });
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const program = cold.program;
  if (!program.chunks) {
    throw new Error(`the scene falls back for ${JSON.stringify(program.fallback)}`);
  }
  const story = new ProgramStory(program.chunks);
  story.onError = () => {};
  const images = config.candidate === "image";
  const run = (): Run => {
    story.ResetState();
    story.ChoosePathString(SCENE);
    const lines: string[] = [];
    const keys = new Set<string>();
    let nodes = 0;
    let nodeMs = 0;
    let held = 0;
    for (;;) {
      while (story.canContinue) {
        story.Continue();
        lines.push(story.currentText ?? "");
        // One search node and its sibling: fork the state and claim the
        // site by its key; run the node on to the next line and fork there;
        // then run the sibling from the first fork, which restores it with
        // the node's run to undo. Only the forks and the restore are timed.
        if (!story.canContinue) break;
        let t0 = performance.now();
        let fork: unknown;
        if (images) {
          const image = story.capture();
          keys.add(imageDigest(image));
          held += image.globals.size + image.tables.size + (image.countIds?.length ?? 0);
          fork = image;
        } else {
          const json = story.state.toJson();
          keys.add(extendSeq("", json));
          held += json.length;
          fork = json;
        }
        nodeMs += performance.now() - t0;
        story.Continue();
        t0 = performance.now();
        if (images) {
          keys.add(imageDigest(story.capture()));
          story.restore(fork as ProgramImage);
        } else {
          keys.add(extendSeq("", story.state.toJson()));
          story.state.LoadJson(fork as string);
        }
        nodeMs += performance.now() - t0;
        nodes += 1;
      }
      if (story.currentChoices.length === 0) break;
      lines.push(story.currentChoices.map((c) => c.text).join("|"));
      story.ChooseChoiceIndex(0);
    }
    return { lines, nodes, nodeMs, keys: keys.size, held };
  };
  const perNode: number[] = [];
  let last: Run = { lines: [], nodes: 0, nodeMs: 0, keys: 0, held: 0 };
  for (let i = 0; i < config.warmup + config.samples; i++) {
    last = run();
    if (i >= config.warmup) perNode.push((last.nodeMs * 1000) / Math.max(1, last.nodes));
  }
  const plain = last.lines.filter((line) => line !== "");
  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: perNode.length,
    lines: plain.length,
    nodes: last.nodes,
    distinctKeys: last.keys,
    heldPerNode: last.held / Math.max(1, last.nodes),
    outputDigest: createHash("sha256").update(JSON.stringify(plain)).digest("hex"),
    microsecondsPerNode: stats(perNode),
    stats: images ? { ...story.images.stats } : undefined,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number, d = 1) => n.toFixed(d).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: scene ${SCENE}, ${report.lines} lines, a search node after each of ${report.nodes}; ${report.samples} samples after ${report.warmup} warm-up`,
      `  output digest ${report.outputDigest}`,
      images
        ? `  a node's image holds ${report.heldPerNode.toFixed(1)} globals, tables and count ids on average; ${report.stats!.keyframes} keyframes and ${report.stats!.deltas} deltas over the run`
        : `  a node's JSON is ${Math.round(report.heldPerNode)} characters on average`,
      `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"per node (microseconds)".padEnd(28)} ${f(report.microsecondsPerNode.min, 2)} ${f(report.microsecondsPerNode.median, 2)} ${f(report.microsecondsPerNode.max, 2)}`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`image bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
