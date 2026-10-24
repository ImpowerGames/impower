import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/></svg>`;
const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: SVG },
  ] });
  return compiler.compile({ textDocument: { uri: URI } }).program;
};
const circularDiagnostics = (program: ReturnType<typeof compile>) =>
  (program.diagnostics?.[URI] ?? []).filter((diagnostic) =>
    /circular/i.test(typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value),
  );

describe("circular filtered_image chains", () => {
  it("reports one error at the declaration that closes the cycle", () => {
    const program = compile(`define loop_a as filtered_image with
  image = loop_b
end

define loop_b as filtered_image with
  image = loop_a
end
`);
    const diagnostics = circularDiagnostics(program);
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic!.severity).toBe(1);
    expect(diagnostic!.range.start.line).toBe(4);
    const message = typeof diagnostic!.message === "string" ? diagnostic!.message : diagnostic!.message.value;
    expect(message).toContain("loop_a");
    expect(message).toContain("loop_b");
  });

  it("reports a look that names itself", () => {
    const program = compile(`define selfie as filtered_image with
  image = selfie
end
`);
    const diagnostics = circularDiagnostics(program);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.range.start.line).toBe(0);
  });

  it("reports the cycle once, not at a look that only leads into it", () => {
    const program = compile(`define loop_a as filtered_image with
  image = loop_b
end

define loop_b as filtered_image with
  image = loop_a
end

define entry as filtered_image with
  image = loop_a
end
`);
    const diagnostics = circularDiagnostics(program);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.range.start.line).toBe(4);
  });

  it("says nothing about a chain that reaches an image", () => {
    const program = compile(`define happy_mia as filtered_image with
  image = mia
  attributes = { "happy" }
end

define sad_mia as filtered_image with
  image = happy_mia
  attributes = { "sad" }
end
`);
    expect(circularDiagnostics(program)).toEqual([]);
  });
});
