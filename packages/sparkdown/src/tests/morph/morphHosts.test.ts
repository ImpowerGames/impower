import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { createMorphHost, fetchedMorphSource, inlineMorphSource } from "../../morph/hosts";
import { MorphBakeService } from "../../morph/service";
import type { MorphArtifact } from "../../morph/types";
import { blinkScript, portrait } from "./fixtures";

const URI = "file:///main.sd";
const SCRIPT = `${blinkScript()}\n[[bunny]]\n`;

function compile(served: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(served ? { stripImageData: true } : {}),
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: SCRIPT, version: 1, languageId: "sparkdown" },
      {
        uri: "file:///bunny.svg",
        type: "image",
        name: "bunny",
        ext: "svg",
        ...(served ? { src: "/file:/local/bunny.svg?v=1-1", text: portrait() } : { data: portrait() }),
      },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

describe("morph hosts", () => {
  test("a player serving plain files fetches the artwork from the image's own src and bakes it in process", async () => {
    const program = compile(true);
    const requested: string[] = [];
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      readSource: fetchedMorphSource(
        () => program.context,
        async (url) => {
          requested.push(url);
          return new Response(portrait());
        },
      ),
    });
    const ref = program.morphs!.variants["bunny"]![0]!;
    const handle = await host.resolve(ref);
    expect(requested).toEqual(["/file:/local/bunny.svg?v=1-1"]);
    expect(handle.artifact.status).toBe("live");
    handle.release();
  });

  test("a host with an asset service asks it for the artifact instead of reading the art", async () => {
    const program = compile(true);
    const inline = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      readSource: inlineMorphSource(() => compile(false).context),
    });
    const ref = program.morphs!.variants["bunny"]![0]!;
    const baked = (await inline.resolve(ref)).artifact;
    const requested: string[] = [];
    const served = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      readSource: async () => {
        throw new Error("the art is not read on this host");
      },
      fetch: async (url) => {
        requested.push(url);
        return new Response(JSON.stringify({ ...baked, key: "whatever-the-service-says" }));
      },
    });
    const handle = await served.resolve(ref);
    expect(requested).toEqual([ref.src]);
    expect(handle.artifact.key).toBe(ref.key);
  });

  test("an asset service answer this build cannot read fails the request, which leaves the consumer static", async () => {
    const program = compile(true);
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      fetch: async () => new Response(JSON.stringify({ format: 999 } satisfies Partial<MorphArtifact>)),
    });
    await expect(host.resolve(program.morphs!.variants["bunny"]![0]!)).rejects.toThrow("not one this player can read");
  });

  test("a reference whose recipe the program lacks fails rather than guessing one", async () => {
    const program = compile(false);
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: {}, variants: program.morphs!.variants }),
      readSource: inlineMorphSource(() => program.context),
    });
    await expect(host.resolve(program.morphs!.variants["bunny"]![0]!)).rejects.toThrow("no recipe");
  });
});
