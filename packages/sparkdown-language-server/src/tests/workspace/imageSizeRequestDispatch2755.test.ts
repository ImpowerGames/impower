import { afterAll, describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { TestWorkspace, silentConnection } from "./languageServerWorker";

vi.stubGlobal("self", globalThis);
afterAll(() => vi.unstubAllGlobals());

const root = "file:///project";
const base = `${root}/assets/Images/Portraits/ava.png`;
const lids = `${root}/assets/Images/Portraits/ava%20lids.on.png`;
const BLINK = `morph blink {
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

const warnedUris = (program: SparkProgram) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, list]) =>
    list.some((d) => JSON.stringify(d.message).includes("Export every layer at the document size")) ? [uri] : [],
  );

class SizingWorkspace extends TestWorkspace {
  readonly asked: string[] = [];
  readonly published: SparkProgram[] = [];

  override async getFileImageSize(uri: string) {
    this.asked.push(uri);
    return uri === lids ? { width: 480, height: 640 } : { width: 512, height: 768 };
  }

  override onCompiledTextDocument(params: { textDocument: { uri: string }; program: SparkProgram }) {
    this.published.push(params.program);
  }
}

const open = async (scripts: Record<string, string>) => {
  const workspace = new SizingWorkspace(silentConnection);
  await workspace.initialize({
    rootUri: root,
    capabilities: {},
    initializationOptions: {
      settings: { scriptFiles: "**/*.sd", imageFiles: "**/*.png" },
      files: [
        ...Object.entries(scripts).map(([name, text]) => ({
          uri: `${root}/${name}`,
          text,
          version: 1,
          languageId: "sparkdown",
          src: `${root}/${name}`,
        })),
        { uri: base, version: 1, languageId: "", src: base },
        { uri: lids, version: 1, languageId: "", src: lids },
      ],
    },
  } as never);
  await workspace.whenCompilerConfigured;
  return workspace;
};

describe("a compile asks the host for the sizes its program requests (#2755)", () => {
  test.each([
    ["main.sd", { "main.sd": `${BLINK}scene start\n  [[ava]]\nend\n` }],
    ["story.sd with no main.sd", { "story.sd": `${BLINK}scene start\n  [[ava]]\nend\n` }],
    ["story.sd beside a main.sd", { "story.sd": `${BLINK}scene start\n  [[ava]]\nend\n`, "main.sd": "scene other\n  Hello\nend\n" }],
  ] as const)("sizes the layer files and warns on the mismatched one: %s", async (_case, scripts) => {
    const workspace = await open(scripts);
    const uri = `${root}/${Object.keys(scripts)[0]}`;
    await workspace.compile(uri, true);
    await vi.waitFor(
      () => {
        expect(workspace.asked.slice().sort()).toEqual([base, lids].sort());
        expect(workspace.published.some((program) => warnedUris(program).includes(lids))).toBe(true);
      },
      { timeout: 3000, interval: 25 },
    );
  });

  test("a project with no morph-fitted layered picture asks for no sizes", async () => {
    const workspace = await open({ "main.sd": "scene start\n  [[ava]]\nend\n" });
    await workspace.compile(`${root}/main.sd`, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(workspace.asked).toEqual([]);
  });
});
