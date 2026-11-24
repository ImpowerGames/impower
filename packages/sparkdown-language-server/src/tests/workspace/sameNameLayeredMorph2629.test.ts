import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";

const SCRIPT = `morph blink {
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

define kit as layered_image with
  assets = {
    ["base"] = kit,
    ["lids.on"] = overlay,
  }
end

scene start
  [[kit]]
end
`;

const compile = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: SCRIPT, version: 1, languageId: "sparkdown" },
      { uri: "file:///project/kit.png", type: "image", name: "kit", ext: "png", src: "/src/kit.png", version: 1 },
      { uri: "file:///project/overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png", version: 1 },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program as any;
};

describe("a hand-written picture whose base file has the picture's own name (#2629)", () => {
  it("the language server bakes the picture's layered artwork and maps its diagnostics to the layer files", async () => {
    const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as any;
    Object.assign(workspace, { _watchedFiles: new Map() });
    const program = compile();
    const consumers = workspace.morphRefs(program);
    expect(consumers.map((consumer: any) => [consumer.variant, consumer.ref.layered, Object.values(consumer.files ?? {}).sort()])).toEqual([
      ["kit", true, ["file:///project/kit.png", "file:///project/overlay.png"]],
    ]);
    const handle = await workspace.morphHost(program).resolve(consumers[0].ref);
    expect(handle.artifact.status).toBe("live");
    handle.release();
  });
});
