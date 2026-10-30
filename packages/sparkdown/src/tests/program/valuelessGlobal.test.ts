import { afterEach, describe, expect, it, vi } from "vitest";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf } from "./programHarness";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a global declaration with no value", () => {
  it("is reported at the declaration by name, and the compile still makes a program", () => {
    const declareImplicitParents = Story.prototype.DeclareImplicitParents;
    vi.spyOn(Story.prototype, "DeclareImplicitParents").mockImplementation(
      function (this: Story, ...args) {
        const x = this.variableDeclarations.get("x");
        if (!x) {
          return declareImplicitParents.apply(this, args);
        }
        const name = new Identifier("orphan");
        name.debugMetadata = x.identifier!.debugMetadata;
        const valueless = new VariableAssignment({
          variableIdentifier: name,
          isGlobalDeclaration: true,
        });
        this.AddNewVariableDeclaration(valueless);
        return declareImplicitParents.apply(this, args);
      },
    );

    const { program } = compileScript("\n\nstore x = 1\n\nscene start\nend\n");

    expect(program.chunks).toBeTruthy();
    const errors = errorsOf(program);
    expect(errors).toHaveLength(1);
    const [line, message] = errors[0]!;
    expect(line).toBe(2);
    expect(message).toContain("`orphan`");
    expect(message).not.toContain("The compile stopped");

    const story = new ProgramStory(program.chunks!);
    const runtimeErrors: string[] = [];
    story.onError = (m: string) => runtimeErrors.push(m);
    story.ContinueMaximally();
    expect(runtimeErrors).toEqual([]);
    const x = story.variablesState.GetVariableWithName("x") as {
      valueObject?: unknown;
    } | null;
    expect(x?.valueObject).toBe(1);
    expect(story.variablesState.GetVariableWithName("orphan") == null).toBe(
      true,
    );
  });
});
