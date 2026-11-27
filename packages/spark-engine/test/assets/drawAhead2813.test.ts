import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { Clock } from "../../src/game/core/classes/Clock";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { type Game } from "../../src/game/core/classes/Game";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const asset = (type: string, name: string, ext: string): File => ({
  uri: `inmemory:///${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("image", "dusk", "svg"),
  asset("image", "hall", "svg"),
  asset("image", "nova", "svg"),
  asset("image", "room", "png"),
];

const STORY = `framing close {
  zoom = 1.5
}

animation swell {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "1.25"
    }
  }
  timing {
    duration = 0.5
  }
}

scene start
  Line zero.
  [[show backdrop dusk]]
  Line one.
  [[show backdrop hall]]
  Line two.
  [[show portrait nova with swell]]
  Line three.
  [[animate backdrop to close over 1s]]
  Line four.
  [[show backdrop room]]
  Line five.
end
`;

const LINE_ZERO = STORY.split("\n").indexOf("  Line zero.");

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
};

const draws = (messages: any[]) => messages.filter((m) => m?.method === "assets/draw");

const summary = (message: any) =>
  message.params.pictures.map((p: any) => ({
    target: p.target,
    name: p.content.imageNames,
    distance: p.distance,
    zoom: p.zoom,
    scale: p.scale,
  }));

describe("drawing the next beats' pictures, sized from the beats ahead (#2813)", () => {
  it("requests a picture that stays on screen across the predicted beats once, at the largest framing it reaches, and a picture that leaves before the zoom at its own", async () => {
    const h = createHarness(STORY, LINE_ZERO, { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    h.reset();
    h.game.module.assets.onBeatSettled();
    const sent = draws(h.messages);
    expect(sent).toHaveLength(1);
    expect(summary(sent[0])).toEqual([
      { target: "backdrop", name: "dusk", distance: 1, zoom: 1, scale: 1 },
      { target: "backdrop", name: "hall", distance: 2, zoom: 1.5, scale: 1 },
      { target: "portrait", name: "nova", distance: 3, zoom: 1, scale: 1.25 },
    ]);
    const hall = sent[0].params.pictures[1].content;
    expect(hall.pictures).toEqual([
      expect.objectContaining({ vector: true, files: [expect.objectContaining({ src: expect.stringContaining("/proj/hall.svg") })] }),
    ]);
  });

  it("lists the pictures of both branches of a choice while the choice is on screen", async () => {
    const CHOICE = `scene start
  Pick a door:
  choose
    + (a) Left
      [[show sigil dusk]]
      The left door opens.
      -> DONE
    + (b) Right
      [[show portrait nova]]
      The right door opens.
      -> DONE
  end
end
`;
    const h = createHarness(CHOICE, CHOICE.split("\n").indexOf("  Pick a door:"), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    h.reset();
    h.game.module.assets.onBeatSettled();
    expect(summary(draws(h.messages)[0]).map((p: any) => `${p.target} ${p.name}`)).toEqual(["sigil dusk", "portrait nova"]);
  });

  it("leaves out a plain bitmap, which has nothing to draw ahead", async () => {
    const h = createHarness(STORY, LINE_ZERO, { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    h.reset();
    h.game.module.assets.onBeatSettled();
    expect(summary(draws(h.messages)[0]).map((p: any) => p.name)).not.toContain("room");
  });

  it("is sent when the line's text has finished, and at once when a click skips the typing", async () => {
    const h = createHarness(STORY, LINE_ZERO, { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    h.reset();
    const typed = new Coordinator(h.game, {
      text: { dialogue: [{ control: "show", text: "Hello", after: 0.5 }] },
      end: 1,
    });
    await flushMicrotasks();
    typed.onUpdate({ deltaMS: 16 } as Clock);
    typed.onUpdate({ deltaMS: 16 } as Clock);
    expect(draws(h.messages)).toHaveLength(0);
    typed.onUpdate({ deltaMS: 2000 } as Clock);
    typed.onUpdate({ deltaMS: 16 } as Clock);
    expect(draws(h.messages)).toHaveLength(1);
    h.reset();
    const skipped = new Coordinator(h.game, {
      text: { dialogue: [{ control: "show", text: "Hello", after: 0.5 }] },
      end: 1,
    });
    await flushMicrotasks();
    skipped.onUpdate({ deltaMS: 16 } as Clock);
    skipped.onUpdate({ deltaMS: 16 } as Clock);
    expect(draws(h.messages)).toHaveLength(0);
    skipped.onMessage({ jsonrpc: "2.0", method: "event", params: { type: "pointerdown", button: 0 } } as never);
    skipped.onUpdate({ deltaMS: 16 } as Clock);
    expect(draws(h.messages)).toHaveLength(1);
  });
});

const settle = (h: any) => {
  h.reset();
  h.game.module.assets.onBeatSettled();
  return draws(h.messages)[0].params.pictures.map((p: any) => ({ name: p.content.imageNames, zoom: p.zoom, scale: p.scale }));
};

const at = (story: string, line: string) => story.split("\n").indexOf(line);

describe("what the beats ahead are walked through (#2813, round 1)", () => {
  it("gives the zoom after a choice joins to the picture of every branch, and skips a branch the current line cannot reach", async () => {
    const story = `framing close {
  zoom = 1.5
}

scene start
  Choose.
  choose
    + (a) Left
      [[show backdrop hall]]
      Left.
    + (b) Right
      [[show backdrop dusk]]
      Right.
  end
  [[animate backdrop to close over 1s]]
  Zoom.
end
`;
    const h = createHarness(story, at(story, "  Choose."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(settle(h)).toEqual([
      { name: "hall", zoom: 1.5, scale: 1 },
      { name: "dusk", zoom: 1.5, scale: 1 },
    ]);
    const beats = h.game.program.sceneAssets!["start"]!.beats;
    (h.game as any)._executingAddress = beats[0]!.address;
    expect(settle(h).map((p: any) => p.name)).not.toContain("dusk");
  });

  it("keeps a picture on screen through an animate that adds another, so the later zoom reaches it", async () => {
    const story = `framing close {
  zoom = 1.5
}

scene start
  Current.
  [[show backdrop hall]]
  Hall.
  [[animate backdrop dusk]]
  Effect.
  [[animate backdrop to close over 1s]]
  Zoom.
end
`;
    const h = createHarness(story, at(story, "  Current."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(settle(h).find((p: any) => p.name === "hall")?.zoom).toBe(1.5);
  });

  it("takes the scale keyframes of a transition's show animation, as the write resolves it", async () => {
    const story = `animation swell {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "1.25"
    }
  }
  timing {
    duration = 0.5
  }
}

define grow as transition with
  on_show = animation.swell
end

scene start
  Current.
  [[show backdrop hall with grow]]
  Hall.
end
`;
    const h = createHarness(story, at(story, "  Current."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(settle(h)).toEqual([{ name: "hall", zoom: 1, scale: 1.25 }]);
  });

  it("multiplies the picture's own scale by the scales of the elements a transition moves with it, as a beat prepares it", async () => {
    const story = `animation swell {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "2"
    }
  }
  timing {
    duration = 0.5
  }
}

animation stage_swell {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "1.5"
    }
  }
  timing {
    duration = 0.5
  }
}

define grow as transition with
  on_show = animation.swell
  stage = animation.stage_swell
end

scene start
  Current.
  [[show backdrop hall with grow]]
  Hall.
end
`;
    const h = createHarness(story, at(story, "  Current."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(settle(h)).toEqual([{ name: "hall", zoom: 1, scale: 3 }]);
  });

  it("gives a picture the scale its hiding effect grows it to", async () => {
    const story = `animation swell {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "2"
    }
  }
  timing {
    duration = 0.5
  }
}

scene start
  Current.
  [[show backdrop hall]]
  Hall.
  [[hide backdrop with swell]]
  Gone.
end
`;
    const h = createHarness(story, at(story, "  Current."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(settle(h)).toEqual([{ name: "hall", zoom: 1, scale: 2 }]);
  });

  it("keeps a later decision reachable from inside an earlier one", async () => {
    const story = `store open = true

scene start
  if open then
    [[show backdrop hall]]
    Open.
  else
    [[show backdrop dusk]]
    Shut.
  end
  if open then
    [[show portrait nova]]
    Nova.
  end
end
`;
    const h = createHarness(story, at(story, "    Open."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(h.errors).toEqual([]);
    const beats = h.game.program.sceneAssets!["start"]!.beats;
    (h.game as any)._executingAddress = beats[0]!.address;
    expect(settle(h).map((p: any) => p.name)).toEqual(["nova"]);
  });

  it("counts only beats that load something against predict_distance in the stopped preview", async () => {
    const story = `define assets as config with
  predict_distance = 1
end

scene start
  [[show backdrop hall]]
  Current.
  [[hide portrait]]
  Hidden.
  [[show portrait nova]]
  Next picture.
end
`;
    const h = createHarness(story, at(story, "  Current."), { assets: ASSETS });
    await h.ready;
    await h.preview(at(story, "  Current."));
    expect(settle(h).map((p: any) => p.name)).toContain("nova");
  });
});

describe("how far the beats ahead reach (#2813, round 3)", () => {
  it("counts only the beats the current line can reach against predict_distance", async () => {
    const story = `define assets as config with
  predict_distance = 1
end

store open = true

scene start
  if open then
    [[show backdrop hall]]
    Open.
  else
    [[show backdrop dusk]]
    Shut.
  end
  [[show portrait nova]]
  Nova.
end
`;
    const h = createHarness(story, at(story, "    Open."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(h.errors).toEqual([]);
    const beats = h.game.program.sceneAssets!["start"]!.beats;
    (h.game as any)._executingAddress = beats[0]!.address;
    expect(settle(h).map((p: any) => p.name)).toEqual(["nova"]);
  });

  it("draws the next scene's pictures that a load has brought in, and not those of a scene no load covers", async () => {
    const story = `define assets as config with
  predict_distance = 2
  load_distance = 1
  loading_min = 0
end

scene start
  Holding.
  -> Next
end

scene Next
  [[show backdrop hall]]
  Next picture.
  [[show backdrop dusk]]
  Past the load.
end
`;
    const h = createHarness(story, at(story, "  Holding."), { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    expect(h.errors).toEqual([]);
    expect(settle(h)).toEqual([]);
    const id = h.game.module.assets.runLoad([{ name: "Next" }]);
    await flushMicrotasks(40);
    expect(h.game.module.assets.isReady(id)).toBe(true);
    expect(settle(h)).toEqual([{ name: "hall", zoom: 1, scale: 1 }]);
  });
});

const ROUTE_ASSETS: File[] = [...ASSETS, asset("image", "one", "svg"), asset("image", "two", "svg"), asset("image", "three", "svg")];

const loadedRoutes = async (story: string, loads: string[]) => {
  const h = createHarness(story, at(story, "  Holding."), { assets: ROUTE_ASSETS, beforeConnect: playing });
  await h.ready;
  expect(h.errors).toEqual([]);
  const id = h.game.module.assets.runLoad(loads.map((name) => ({ name })));
  await flushMicrotasks(100);
  expect(h.game.module.assets.isReady(id)).toBe(true);
  return settle(h);
};

const routeConfig = (distance: number) => `define assets as config with
  predict_distance = ${distance}
  load_distance = 0
  loading_min = 0
end
`;

describe("the loaded scenes ahead, route by route (#2813, round 4)", () => {
  it("gives a scene two routes reach the horizon the shorter route leaves, whichever route is listed first", async () => {
    for (const shortFirst of [false, true]) {
      const story = `${routeConfig(4)}
scene start
  Holding.
  choose
    + (a) First
      -> ${shortFirst ? "Short" : "Long"}
    + (b) Second
      -> ${shortFirst ? "Long" : "Short"}
  end
end

scene Long
  [[show backdrop hall]]
  Long one.
  [[show portrait nova]]
  Long two.
  [[show sigil dusk]]
  Long three.
  -> Join
end

scene Short
  [[show backdrop room]]
  Short one.
  -> Join
end

scene Join
  [[show backdrop one]]
  One.
  [[show backdrop two]]
  Two.
  [[show backdrop three]]
  Three.
end
`;
      const names = (await loadedRoutes(story, ["Long", "Short", "Join"])).map((p: any) => p.name);
      expect(names).toEqual(expect.arrayContaining(["hall", "nova", "dusk", "one", "two", "three"]));
    }
  });

  it("sizes each alternative scene's picture for the zoom of the scene both lead to", async () => {
    const story = `${routeConfig(4)}
framing close {
  zoom = 1.5
}

scene start
  Holding.
  choose
    + (a) Left
      -> Left
    + (b) Right
      -> Right
  end
end

scene Left
  [[show backdrop hall]]
  Left picture.
  -> Join
end

scene Right
  [[show backdrop dusk]]
  Right picture.
  -> Join
end

scene Join
  [[animate backdrop to close over 1s]] [[show portrait nova]]
  Both zoom here.
end
`;
    const pictures = await loadedRoutes(story, ["Left", "Right", "Join"]);
    expect(pictures.find((p: any) => p.name === "hall")?.zoom).toBe(1.5);
    expect(pictures.find((p: any) => p.name === "dusk")?.zoom).toBe(1.5);
  });

  it("keeps a predict_distance of zero to the current scene, though the next scene is loaded", async () => {
    const story = `${routeConfig(0)}
scene start
  Holding.
  -> Next
end

scene Next
  [[show backdrop hall]]
  Next picture.
end
`;
    expect(await loadedRoutes(story, ["Next"])).toEqual([]);
  });
});
