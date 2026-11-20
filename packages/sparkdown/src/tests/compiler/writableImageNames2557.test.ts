import { describe, expect, it } from "vitest";
import { isWritableImageName } from "../../attributes/imageFileName";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const workspace = Object.create(SparkdownWorkspace.prototype) as SparkdownWorkspace;
workspace.loadConfiguration({ imageFiles: "**/*.{png,webp,svg}", audioFiles: "**/*.{wav,mp3}" });
const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const IMAGES = `${ROOT}/assets/Images`;

const messagesOf = (line: string, stems: readonly string[]): string[] => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: `scene start\n${line}\nend\n`, version: 1, languageId: "sparkdown" },
      ...stems.map((stem) => {
        const uri = `${IMAGES}/${stem}.png`;
        return {
          uri,
          type: workspace.getFileType(uri),
          name: workspace.getFileName(uri),
          ext: workspace.getFileExtension(uri),
          src: uri,
          version: 1,
        };
      }),
    ] as never,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program as unknown as {
    diagnostics?: Record<string, { message: string | { value: string } }[]>;
  };
  return Object.values(program.diagnostics ?? {})
    .flat()
    .map(({ message }) => (typeof message === "string" ? message : message.value));
};

const resolves = (name: string, line: string): boolean =>
  messagesOf(line, [name]).length === 0 &&
  messagesOf(line, []).some((message) => message === `Cannot find image named \`${name}\``);

const NAMES = [
  "bar",
  "ava@night",
  "foo_@bar",
  "_@x",
  "a1@2",
  "é@x",
  "x@é",
  "café@night",
  "@foo",
  "foo@",
  "@",
  "~foo",
  "foo~bar",
  "foo~",
  "a@@b",
  "a@-b",
  "é@",
  "@é",
  "café",
  "my pic",
  "a b c",
  "my-pic",
  "my'pic",
  "my!pic",
  "my(pic)",
  "my,pic",
  "my+pic",
  "my#pic",
  "my$pic",
  "my&pic",
  "my_pic",
  "-pic",
  "pic-",
  "my--pic",
  "1pic",
  "ava@night-sky",
  "日本",
];

describe("an image name is writable exactly when the compiler shows that file for its image tag (#2557, #2611)", () => {
  it.each(NAMES.flatMap((name) => [`[[${name}]]`, `[[show portrait ${name}]]`].map((line) => [name, line])))(
    "%s in %s",
    (name, line) => {
      expect(isWritableImageName(name!)).toBe(resolves(name!, line!));
    },
  );

  it("covers names on both sides of the rule", () => {
    expect(NAMES.filter(isWritableImageName).length).toBeGreaterThan(0);
    expect(NAMES.filter((name) => !isWritableImageName(name)).length).toBeGreaterThan(0);
  });
});
