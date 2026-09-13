import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

const URI = "file:///project/main.sd";

function compilerFor(source: string, extraFiles: File[] = []) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
      ...extraFiles,
    ],
  });
  return compiler;
}

function diagnosticsFrom(compiler: SparkdownCompiler): string[] {
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  return Object.values(program.diagnostics ?? {}).flatMap((diagnostics) =>
    diagnostics.map((diagnostic: any) =>
      typeof diagnostic.message === "string"
        ? diagnostic.message
        : diagnostic.message?.value,
    ),
  );
}

function diagnosticsFor(source: string, extraFiles: File[] = []): string[] {
  return diagnosticsFrom(compilerFor(source, extraFiles));
}

const missingType = (diagnostics: string[], type: string) =>
  diagnostics.some((message) => message.includes(`type named \`${type}\``));

describe("define parent type validity", () => {
  test("accepts a user-defined parent type declared in the same program", () => {
    const diagnostics = diagnosticsFor(`define companion as character with
  store trust = 0
end

define O as companion with
  name = "Orion"
end

scene only
  Hello.
end
`);

    expect(missingType(diagnostics, "companion")).toBe(false);
  });

  test("accepts a user-defined parent type declared later in the program", () => {
    const diagnostics = diagnosticsFor(`define O as companion with
  name = "Orion"
end

define companion as character with
  store trust = 0
end
`);

    expect(missingType(diagnostics, "companion")).toBe(false);
  });

  test("still warns for an unknown parent type", () => {
    const diagnostics = diagnosticsFor(`define O as nosuchtype with
  name = "Orion"
end
`);

    expect(missingType(diagnostics, "nosuchtype")).toBe(true);
  });

  test("does not accept an asset name as an undeclared parent", () => {
    const diagnostics = diagnosticsFor(
      'define O as portrait with\n  name = "Orion"\nend\n',
      [{
        uri: "file:///project/portrait.png",
        type: "image",
        name: "portrait",
        ext: "png",
        src: "/portrait.png",
      }],
    );
    expect(missingType(diagnostics, "portrait")).toBe(true);
  });

  test.each(["red", "linear", "loading"])(
    "does not accept the builtin instance %s as an undeclared parent",
    (parent) => {
      const diagnostics = diagnosticsFor(
        `define O as ${parent} with\n  name = "Orion"\nend\n`,
      );
      expect(missingType(diagnostics, parent)).toBe(true);
    },
  );

  test.each([true, false])("only accepts a parent from a participating script (included: %s)", (included) => {
    const diagnostics = diagnosticsFor(
      `${included ? "include parents.sd\n" : ""}define O as companion with\n  name = "Orion"\nend\n`,
      [{
        uri: "file:///project/parents.sd",
        type: "script",
        name: "parents",
        ext: "sd",
        text: "define companion as character with\n  store trust = 0\nend\n",
        version: 1,
        languageId: "sparkdown",
      }],
    );
    expect(missingType(diagnostics, "companion")).toBe(!included);
  });

  test("refreshes parent validity after a declaration is renamed and restored", () => {
    const compiler = compilerFor(
      'define companion as character with\n  store trust = 0\nend\ndefine O as companion with\n  name = "Orion"\nend\n',
    );
    expect(missingType(diagnosticsFrom(compiler), "companion")).toBe(false);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 16 } },
        text: "friend",
      }],
    });
    expect(missingType(diagnosticsFrom(compiler), "companion")).toBe(true);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 13 } },
        text: "companion",
      }],
    });
    expect(missingType(diagnosticsFrom(compiler), "companion")).toBe(false);
  });
});
