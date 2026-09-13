import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function diagnosticsFor(source: string): string[] {
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
    ],
  });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  return Object.values(program.diagnostics ?? {}).flatMap((diagnostics) =>
    diagnostics.map((diagnostic: any) =>
      typeof diagnostic.message === "string"
        ? diagnostic.message
        : diagnostic.message?.value,
    ),
  );
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
});
