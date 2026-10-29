import { describe, expect, it } from "vitest";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { Game } from "../../game/core/classes/Game";
import { compileProgram, requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

const plan = (source: string, line: number) => {
  const program = requireChunks(compileProgram(source), "fin route fixture");
  const game = new Game({ program: program as any, now: () => 0 } as any);
  const fin = programLocator(program as any).addressAt(URI, line)!;
  return {
    fin,
    route: (to: number) =>
      Game.planRoute(game.story, program as any, game.routeStartOf(fin), to),
  };
};

describe("a route to a fin", () => {
  it.each([
    ["at the top level", "Hello.\nfin\n", 1],
    ["in a scene", "scene start\n  Hello.\n  fin\nend\n", 2],
  ])("%s ends on the End it runs", (_name, source, line) => {
    const { fin, route } = plan(source, line);
    const found = route(fin);
    expect(found == null).toBe(false);
    expect(found!.steps.at(-1)!.address).toBe(fin);
  });

  it("does not reach the address after the End, which never runs", () => {
    const { fin, route } = plan("Hello.\nfin\n", 1);
    expect(route(fin + 2) == null).toBe(true);
  });
});
