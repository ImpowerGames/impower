import { describe, expect, test } from "vitest";
import { talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const P = "inmemory:///assets/Images/Portraits";

const png = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}` } as any;
};

const FILES = [png("ava.png"), png("ava mouth.closed default.png"), png("ava mouth.open.png"), png("ava lids.on.png")];

const LIDS = `morph lids_blink {
  blend = cut
  keyframes {
    from {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    to {
      lids {
        state = off
      }
    }
  }
}
`;

const FLAP = `morph flap {
  blend = cut
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
}
`;

async function written(source: string, assets: any[], again?: string) {
  const harness = createHarness(source, 0, { assets });
  const logged: [string, string][] = [];
  (harness.game as any)._context.system.log = (message: unknown, severity: string) => logged.push([String(message), severity]);
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const rewritten = again ? (harness.game as any).module.ui.getMorphContent([again], () => undefined) : undefined;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const messages = flattenMessages(harness.messages);
  const writes = messages.filter(
    (message: any) =>
      message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions[0]?.content?.morph,
  );
  return {
    contents: [...writes.map((write: any) => write.params.instructions[0].content), ...(rewritten ? [{ morph: rewritten }] : [])],
    artifacts: messages.filter((message: any) => message?.method === "morph/artifact").map((message: any) => message.params),
    warnings: logged.filter(([, severity]) => severity === "warning").map(([message]) => message),
  };
}

describe("an image write of a picture made of image files (#2629)", () => {
  const SOURCE = `${LIDS}\n${FLAP}\n\nscene start\n  HERO:\n    [[show portrait ava]]\n    Line one.\nend\n`;

  test("carries one play for each morph on one reference spanning the picture's layers, and the artifact is sent once for its key", async () => {
    const { contents, artifacts, warnings } = await written(SOURCE, FILES, "ava");
    expect(contents).toHaveLength(2);
    for (const content of contents) {
      const plays = content.morph.plays;
      expect(plays.map((play: any) => play.morph)).toEqual(["flap", "lids_blink"]);
      expect(plays.map((play: any) => play.layer)).toEqual([0, 0]);
      expect(plays[0].ref).toEqual(plays[1].ref);
      expect(plays[0].ref).toMatchObject({ morphs: ["flap", "lids_blink"], image: "ava", groups: ["mouth", "lids"] });
      expect(plays[0].picture).toEqual({
        span: 2,
        files: [
          { src: "/src/ava.png", name: "ava.png" },
          { src: "/src/ava lids.on.png", name: "ava lids.on.png" },
          { src: "/src/ava mouth.closed default.png", name: "ava mouth.closed default.png" },
          { src: "/src/ava mouth.open.png", name: "ava mouth.open.png" },
        ],
      });
    }
    const key = contents[0].morph.plays[0].ref.key;
    const sent = artifacts.filter((params: any) => params.key === key);
    expect(sent).toHaveLength(1);
    expect(sent[0].artifact).toMatchObject({ status: "live", diagnostics: [] });
    expect(warnings).toEqual([]);
  });

  test("a hand-written layered_image whose SVG layer plays a morph of its own keeps that morph, and the picture's own morph does not play", async () => {
    const svg = { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() } as any;
    const lids = { uri: "inmemory:///lid_file.png", type: "image", name: "lid_file", ext: "png", src: "/src/lid_file.png" } as any;
    const source = `${LIDS}\n${talkScript()}\ndefine kit as layered_image with\n  assets = {\n    ["face"] = bunny,\n    ["lids.on"] = lid_file,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\n    Line two.\nend\n`;
    const { contents, warnings } = await written(source, [svg, lids]);
    const plays = contents.at(-1).morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image, play.picture])).toEqual([["talk", "bunny", undefined]]);
    expect(warnings).toEqual(["`lids_blink` does not play on `kit`: one of its layers plays morphs of its own, and those keep playing."]);
  });
});
