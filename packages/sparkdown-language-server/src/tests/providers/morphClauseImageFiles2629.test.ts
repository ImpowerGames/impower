import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, test } from "vitest";
import { completeAt } from "./braceCompletionHarness";

const P = "file:///proj/assets/Images/Portraits";

const png = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}`, version: 1 };
};

const speech = (name: string, group: string, from: string, to: string) => `morph ${name} {
  blend = cut
  keyframes {
    from {
      ${group} {
        state = ${from}
      }
    }
    to {
      ${group} {
        state = ${to}
      }
    }
  }
  timing {
    trigger = speech
  }
}
`;

const MORPHS = `${speech("talk", "mouth", "closed", "open")}
${speech("chatter", "lids", "off", "on")}
`;

const DEFINES = `define jaw as layered_image with
  assets = {
    ["lids.on"] = overlay,
  }
end
`;

const FILES = [png("ava.png"), png("ava mouth.closed default.png"), png("ava mouth.open.png"), png("overlay.png")];

const labelsAt = (line: string) => {
  const source = `${MORPHS}\n${DEFINES}\nscene start\n${line}\nend\n`;
  const compiler = new SparkdownCompiler();
  const uri = "file:///proj/main.sd";
  compiler.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text: source.replace("|", ""), version: 1, languageId: "sparkdown" }, ...FILES],
  } as any);
  const program = compiler.compile({ textDocument: { uri } }).program;
  return completeAt(source, program).map((item) => String(item.label)).sort();
};

describe("completion after `morph` on pictures made of image files (#2629)", () => {
  test("a painted portrait offers the speech morph that plays on the whole picture", () => {
    expect(labelsAt("  [[ava morph |]]")).toEqual(["none", "talk"]);
  });

  test("a picture with no layer shown at rest offers the speech morph that plays on it", () => {
    expect(labelsAt("  [[jaw morph |]]")).toEqual(["chatter", "none"]);
  });
});
