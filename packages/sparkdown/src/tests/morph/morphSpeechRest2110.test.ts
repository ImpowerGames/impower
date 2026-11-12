import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { bakeMorphArtifact } from "../../morph/bake";
import { morphPoseAt, morphRestPose, parseMorphRecipe } from "../../morph/recipe";
import { MorphTimeline } from "../../morph/timeline";
import type { MorphTiming } from "../../morph/types";
import { parse } from "../../txml/txml";

const URI = "file:///main.sd";

const square = (name: string, id: string, y: number) => `<path data-name="${name}" id="${id}" d="M0,${y}H10V${y + 10}H0Z"/>`;

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
${square("lids:eyes.open:default", "e-open", 0)}
${square("lids:eyes.closed", "e-closed", 15)}
${square("lips:mouth.open:default", "m-open", 30)}
${square("lips:mouth.closed", "m-closed", 45)}
${square("lips:mouth.teeth", "m-teeth", 60)}
</svg>`;

const TALK_SMILE = `morph talk_smile {
  blend = cut
  rest {
    mouth {
      state = teeth
    }
  }
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
  timing {
    trigger = speech
    duration = 0.16
  }
}

scene start
end
`;

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };
const ids = (svg: string): string[] => {
  const out: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const id = (node as Element).attributes?.["id"];
      if (id) out.push(id.split("_").pop()!);
      walk((node as Element).children ?? []);
    }
  };
  const doc = parse(svg);
  walk(Array.isArray(doc) ? doc : [doc]);
  return out;
};

describe("a speech morph's rest in the bake and the still", () => {
  test("a speech morph whose rest lies outside its keyframes prepares a live portrait resting in that state", () => {
    const program = compile(TALK_SMILE);
    expect((program.diagnostics?.[URI] ?? []).filter((d) => d.severity === 1)).toEqual([]);
    const recipe = parseMorphRecipe(program.morphs!.recipes["talk_smile"]!)!;
    const artifact = bakeMorphArtifact({ source: FACE, selection: {}, recipes: [recipe], key: "k", variant: "face" });
    expect(artifact.status).toBe("live");
    const shown = ids(artifact.rest);
    expect(shown).toContain("m-teeth");
    expect(shown).not.toContain("m-open");
    expect(shown).not.toContain("m-closed");

    const timing = program.context!["morph"]!["talk_smile"]["timing"] as MorphTiming;
    const timeline = new MorphTimeline(timing, () => 0);
    for (const t of [0, 0.08, 0.16, 1, 60]) expect(timeline.at(t)).toEqual({ phase: "off" });
    expect(morphRestPose(recipe)).toEqual({ mouth: "teeth" });
    expect(morphPoseAt(recipe, timeline.start)).toEqual({ mouth: "closed" });
  });

  test("the same morph with `trigger = appear` keeps its time-based schedule", () => {
    const program = compile(TALK_SMILE.replace("trigger = speech", "trigger = appear"));
    const timing = program.context!["morph"]!["talk_smile"]["timing"] as MorphTiming;
    expect(new MorphTimeline(timing, () => 0).at(0.08).phase).toBe("playing");
  });
});
