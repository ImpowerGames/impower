import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { getContextEntry } from "@impower/sparkdown/src/compiler/utils/getContextEntry";
import { morphRefsForStruct } from "@impower/sparkdown/src/morph/channel";
import { createMorphHost, inlineMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { describe, expect, it } from "vitest";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const MIA = "file:///local/mia.svg";
const lips = (...ys: number[]) => ys.map((y) => `<path data-name="lip" d="M10,${y} C30,${y + 25} 70,${y + 25} 90,${y}Z"/>`).join("");
const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g data-name="mouth.smile default">${lips(40, 60)}</g>
<g data-name="mouth.frown">${lips(30, 50, 70)}</g>
</svg>`;

const SOURCE = [
  "morph bend {",
  "  method = match",
  "  timing {",
  "    trigger = change",
  "    duration = 0.08",
  "  }",
  "}",
  "",
  "scene start",
  "  [[show portrait mia:mouth.smile]]",
  "  Mia smiles.",
  "  [[show portrait mia:mouth.frown]]",
  "  Then she does not.",
  "end",
  "",
].join("\n");

const bakesReported = (toEditor: any[]) =>
  toEditor.filter((m) => m.method === "sparkdown/runtimeDiagnostics").map((m) => m.params.morphBakes ?? []);

describe("a change pair the player bakes (#2781)", () => {
  it("reaches the editor in the current run's report, and a line preview keeps it", async () => {
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: SOURCE },
        { uri: MIA, type: "image", name: "mia", ext: "svg", data: FACE },
      ],
      startFrom: { file: MAIN_URI, line: 12 },
    });
    try {
      await h.compile();
      await h.select(12);
      await settle(20);
      const struct = (name: string) => getContextEntry(program.context, "filtered_image", name);
      const compiler = new SparkdownCompiler();
      compiler.configure({
        files: [
          { uri: MAIN_URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
          { uri: MIA, type: "image", name: "mia", ext: "svg", data: FACE },
        ],
      } as any);
      const program = compiler.compile({ textDocument: { uri: MAIN_URI } }).program as any;
      const [ref] = morphRefsForStruct(program.context, program.morphs, struct("mia:mouth.frown"), undefined, { struct: struct("mia:mouth.smile") });
      const inline = inlineMorphSource(() => program.context);
      const host = createMorphHost({
        service: new MorphBakeService(),
        channel: () => program.morphs,
        readSource: async (source, signal) => {
          const read = await inline(source, signal);
          return read ? { text: read.text } : undefined;
        },
      });
      const handle = await host.resolve(ref!);
      MorphPlayback.for(h.overlay).reportChangeBake!(ref!, handle.artifact);
      handle.release();
      await settle(20);
      const reported = [
        { image: "mia", variant: "mia:mouth.frown", diagnostics: [expect.objectContaining({ code: "pairing-count", severity: "warning", morphs: ["bend"], layer: "lip" })] },
      ];
      expect(bakesReported(h.toEditor).at(-1)).toEqual(reported);
      const before = bakesReported(h.toEditor).length;
      await h.select(10);
      await settle(20);
      expect(bakesReported(h.toEditor).length).toBeGreaterThan(before);
      expect(bakesReported(h.toEditor).at(-1)).toEqual(reported);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
