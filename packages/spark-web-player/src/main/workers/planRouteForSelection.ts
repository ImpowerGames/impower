import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { profile } from "../../utils/profile";
import {
  programIdentity,
  type IdentifiableProgram,
} from "../../utils/programIdentity";
import type { RouteSearchLog, RouteSearchReportTarget } from "./RouteSearchLog";

export interface SelectionForRoute extends RouteSearchReportTarget {
  textDocument: { uri: string };
  selectedRange: { start: { line: number } };
  programOutdated?: boolean;
}

export interface RoutableGame {
  readonly program: IdentifiableProgram | undefined;
  readonly startAddress: ProgramAddress | null | undefined;
  setStartFrom(
    startFrom: { file: string; line: number; address?: ProgramAddress },
    beat?: "first" | "last",
  ): void;
}

export interface PlanRouteForSelectionContext<G extends RoutableGame> {
  game: G | undefined;
  running?: boolean;
  rememberStartFrom(startFrom: { file: string; line: number }): void;
  searchRouteTo(game: G, to: ProgramAddress): void;
  routeSearches: RouteSearchLog;
  profilerId: string | undefined;
}

export function routeGameTo<G extends RoutableGame>(
  game: G,
  startFrom: { file: string; line: number; address?: ProgramAddress },
  beat: "first" | "last",
  log: RouteSearchLog,
  search: (game: G, to: ProgramAddress) => void,
  profilerId: string | undefined,
): ProgramAddress | null | undefined {
  profile("start", profilerId + " " + "game/setStartFrom");
  game.setStartFrom(startFrom, beat);
  profile("end", profilerId + " " + "game/setStartFrom");
  const to = game.startAddress;
  if (to != null && !log.holds(to, programIdentity(game.program))) {
    search(game, to);
  }
  return to;
}

export function planRouteForSelection<G extends RoutableGame>(
  params: SelectionForRoute,
  ctx: PlanRouteForSelectionContext<G>,
): void {
  const game = ctx.game;
  if (!game) {
    return;
  }
  const newStartFrom = {
    file: params.textDocument.uri,
    line: params.selectedRange.start.line,
  };
  ctx.rememberStartFrom(newStartFrom);
  if (ctx.running) {
    return;
  }
  if (params.programOutdated) {
    return;
  }
  const to = routeGameTo(
    game,
    newStartFrom,
    "last",
    ctx.routeSearches,
    ctx.searchRouteTo,
    ctx.profilerId,
  );
  ctx.routeSearches.report(params, to);
}
