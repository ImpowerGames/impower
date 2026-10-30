import type { File } from "@impower/sparkdown/src/compiler/types/File";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { documentRangeOf } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { buildPreviewFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { Game } from "../../game/core/classes/Game";
import type { GameExecutedParams } from "../../game/core/classes/messages/GameExecutedMessage";
import type { DocumentLocation } from "../../game/core/types/DocumentLocation";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "../ui/harness/uiTestHarness";

export { MAIN_URI };

export interface ExecutedReport {
  params: GameExecutedParams;
  paths: ProgramAddress[];
  locations: DocumentLocation[];
}

export interface Story {
  source: string;
  lines: string[];
  assets: File[];
}

const syncTimeout = ((fn: Function, _ms?: number, ...a: any[]) => {
  fn(...a);
  return 0;
}) as any;

export const previewFixture = (): Story & { line: number } => {
  const { files, target } = buildPreviewFixture();
  const lines = [
    ...files.get("scripts/characters.sd")!.split("\n"),
    ...files.get("scripts/portraits.sd")!.split("\n"),
    ...files.get("main.sd")!.split("\n"),
  ];
  const assets: File[] = [...files.keys()]
    .filter((key) => key.endsWith(".svg"))
    .map((key) => {
      const name = key.split("/").pop()!.replace(/\.svg$/, "");
      return {
        uri: `inmemory:///${name}.svg`,
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
  const to = sim.startAddress!;
  const route = Game.planRoute(
    sim.story,
    program as any,
    sim.routeStartOf(to),
    to,
  );
  const checkpoint = route ? sim.patchAndSimulateRoute(route) : null;
  if (!checkpoint) {
    throw new Error(`no route reaches line ${line}`);
  }
  return checkpoint;
};

const recordReports = (game: Game) => {
  const reports: ExecutedReport[] = [];
  const g = game as any;
  const take = g.executedParams.bind(game);
  g.executedParams = () => {
    const paths: ProgramAddress[] = g._runtimeState.pathsExecutedThisFrame.toArray();
    const params = take();
    const locations = paths
      .map((p) => {
        const location = game.locator.locationOf(p);
        return location ? documentRangeOf(location) : null;
      })
      .filter((l): l is DocumentLocation => l != null);
    reports.push({ params, paths, locations });
    return params;
  };
  return reports;
};

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
      const address = game.locator.addressAt(MAIN_URI, line);
      if (address != null) {
        game.markPreviewing(address);
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

export const reportSizes = (report: ExecutedReport) => {
  const {
    executedLines: _lines,
    firstLocation: _first,
    lastLocation: _last,
    lastExecutedAddress: _address,
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
