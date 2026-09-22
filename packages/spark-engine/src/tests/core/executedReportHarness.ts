// Games that report what they executed (`game/executed`), for the tests of the
// report and of what the hosts draw from it: a preview at the bottom of the
// benchmark fixture's long scene after its route replays, a preview in a
// second scene, and a running game. Each report comes with the executed paths
// the game held when it took the report, and the locations those paths name,
// so a test can derive from them what a host drew from a report that listed
// every location.
import type { File } from "@impower/sparkdown/src/compiler/types/File";
import { buildPreviewFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { Game } from "../../game/core/classes/Game";
import type { GameExecutedParams } from "../../game/core/classes/messages/GameExecutedMessage";
import type { DocumentLocation } from "../../game/core/types/DocumentLocation";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

export { MAIN_URI };

export interface ExecutedReport {
  params: GameExecutedParams;
  /** The executed paths, in the order the game holds them. */
  paths: string[];
  /** The locations of those paths that have one, in the same order. */
  locations: DocumentLocation[];
}

export interface Story {
  source: string;
  /** The source's lines, as a host's document gives them. */
  lines: string[];
  assets: File[];
}

const syncTimeout = ((fn: Function, _ms?: number, ...a: any[]) => {
  fn(...a);
  return 0;
}) as any;

/** The benchmark fixture as one script: its character and portrait scripts
 *  above its scene, and its pictures as project files. `line` is the target
 *  line near the bottom of the long scene. */
export const previewFixture = (): Story & { line: number } => {
  const { files, target } = buildPreviewFixture();
  const lines = [
    ...files.get("scripts/characters.sd")!.split("\n"),
    ...files.get("scripts/portraits.sd")!.split("\n"),
    ...files
      .get("main.sd")!
      .split("\n")
      .filter((l) => !l.startsWith("include ")),
  ];
  const assets: File[] = [...files.keys()]
    .filter((key) => key.endsWith(".svg"))
    .map((key) => {
      const name = key.split("/").pop()!.replace(/\.svg$/, "");
      return {
        uri: `file://proj/${name}.svg`,
        type: "image",
        name,
        ext: "svg",
        src: `/file:/proj/${name}.svg?v=1`,
      };
    });
  return {
    source: lines.join("\n"),
    lines,
    assets,
    line: lines.indexOf(target.lineText),
  };
};

export const story = (source: string): Story => ({
  source,
  lines: source.split("\n"),
  assets: [],
});

/** The checkpoint the compile worker hands the page for a preview at `line`:
 *  the route to it, simulated. */
const routeCheckpoint = (s: Story, line: number): string => {
  const { program } = compileUI(s.source, {
    assets: s.assets,
  });
  const sim: any = new Game({
    program: program as any,
    now: () => 0,
    setTimeout: syncTimeout,
  } as any);
  sim.setStartFrom({ file: MAIN_URI, line });
  const toPath = sim.startPath as string;
  const route = Game.planRoute(
    sim.story,
    program as any,
    Game.getSimulateFromPath(toPath),
    toPath,
  );
  const checkpoint = route ? sim.patchAndSimulateRoute(route) : null;
  if (!checkpoint) {
    throw new Error(`no route reaches line ${line}`);
  }
  return checkpoint;
};

/** Records every report the game takes, with the paths it held then. */
const recordReports = (game: Game) => {
  const reports: ExecutedReport[] = [];
  const g = game as any;
  const take = g.executedParams.bind(game);
  g.executedParams = () => {
    const paths: string[] = g._runtimeState.pathsExecutedThisFrame.toArray();
    const params = take();
    const locations = paths
      .map((p) => game.getPathDocumentLocation(p))
      .filter((l): l is DocumentLocation => l != null);
    reports.push({ params, paths, locations });
    return params;
  };
  return reports;
};

/** The reports a preview at `line` sends, from a game connected the way the
 *  page connects one: the route's checkpoint loaded, the point marked.
 *  `suggestion` connects it as the player does a displayed suggestion's. */
export const previewReports = async (
  s: Story,
  line: number,
  options: { suggestion?: boolean } = {},
) => {
  let reports: ExecutedReport[] = [];
  const h = createHarness(s.source, line, {
    assets: s.assets,
    loadCheckpoint: routeCheckpoint(s, line),
    beforeConnect: (game) => {
      const path = findClosestPath(
        { file: MAIN_URI, line },
        game.program.pathLocations,
        Object.keys(game.program.scripts ?? {}),
      );
      if (path) {
        game.markPreviewing(path);
      }
      if (options.suggestion) {
        game.reportsExecutedLines = false;
      }
      reports = recordReports(game);
    },
  });
  await h.ready;
  reports.length = 0;
  await h.preview(line);
  await flushMicrotasks(20);
  return reports;
};

/** The reports a game run from `line` sends as it plays its first beats. */
export const runningReports = async (s: Story, line: number) => {
  let reports: ExecutedReport[] = [];
  const h = createHarness(s.source, line, {
    assets: s.assets,
    beforeConnect: (game) => {
      game.setStartFrom({ file: MAIN_URI, line });
      reports = recordReports(game);
    },
  });
  await h.ready;
  reports.length = 0;
  h.game.start();
  await flushMicrotasks(20);
  return reports.filter((r) => r.params.state === "running");
};

/** How large a report is as JSON, and how large it was when it listed every
 *  executed path and every location. */
export const reportSizes = (report: ExecutedReport) => {
  const {
    executedLines: _lines,
    firstLocation: _first,
    lastLocation: _last,
    lastExecutedPath: _path,
    ...rest
  } = report.params;
  return {
    bytes: JSON.stringify(report.params).length,
    listedBytes: JSON.stringify({
      ...rest,
      executedPaths: report.paths,
      locations: report.locations,
    }).length,
  };
};
