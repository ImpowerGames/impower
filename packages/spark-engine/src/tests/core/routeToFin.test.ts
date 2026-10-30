// A route to a `fin`, which lowers to an `End` that forgets where the story
// stood as it ends it (I-1606). The route's last step is the `End` itself,
// and no route reaches an address the story never runs.
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

const SOURCE = "scene start\n  Hello.\n  fin\nend\n";

describe("a route to a fin", () => {
  it("ends on the End it runs", () => {
    const { fin, route } = plan(SOURCE, 2);
    const found = route(fin);
    expect(found == null).toBe(false);
    expect(found!.steps.at(-1)!.address).toBe(fin);
  });

  it("does not reach the address after the End, which never runs", () => {
    const { fin, route } = plan(SOURCE, 2);
    expect(route(fin + 2) == null).toBe(true);
  });
});
