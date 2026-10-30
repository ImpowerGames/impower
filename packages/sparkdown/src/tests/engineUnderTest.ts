import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../compiler/types/SparkdownCompilerConfig";
import { STDLIB, type StdLibEntry } from "../runtime/StdLib";
import type { ProgramRoot } from "../program/ProgramRoot";
import { ProgramStory } from "../program/ProgramStory";

const TEST_EXTERNAL = "__test_external";

const EXTERNAL = /^external[ \t]+([A-Za-z_]\w*)[ \t]*\(([^)]*)\)[ \t]*$/gm;

export const withTestExternals = (text: string): string => {
  const functions: string[] = [];
  const rewritten = text.replace(EXTERNAL, (_line, name: string) => {
    functions.push(
      `function ${name}(...)\n  return ${TEST_EXTERNAL}("${name}", ...)\nend\n`,
    );
    return "";
  });
  return functions.length === 0
    ? text
    : `${rewritten}${rewritten.endsWith("\n") ? "" : "\n"}\n${functions.join("\n")}`;
};

export class TestProgramStory extends ProgramStory {
  readonly externals = new Map<string, (...args: any[]) => unknown>();

  BindExternalFunction(name: string, fn: (...args: any[]) => unknown): void {
    this.externals.set(name, fn);
  }
}

if (!STDLIB[TEST_EXTERNAL]) {
  STDLIB[TEST_EXTERNAL] = {
    arity: -1,
    fn: (story: any, [name, ...args]: any[]) => {
      const external = (story as Partial<TestProgramStory>).externals?.get(
        name?.value,
      );
      if (!external) {
        story.Error(
          `Trying to call external function '${name?.value}' which has not been bound (and ink fallbacks disabled).`,
        );
      }
      const result = external!(...args.map((arg) => arg?.valueObject ?? null));
      return result == null ? undefined : result;
    },
  } as StdLibEntry;
}

class ProgramEngineCompiler extends SparkdownCompiler {
  override configure(config: SparkdownCompilerConfig) {
    return super.configure({
      ...config,
      files: config.files?.map((file) =>
        typeof file.text === "string"
          ? { ...file, text: withTestExternals(file.text) }
          : file,
      ),
    });
  }
}

export function testCompiler(): SparkdownCompiler {
  return new ProgramEngineCompiler();
}

export type TestStory = TestProgramStory;

export function testStory(root: ProgramRoot | undefined): TestStory {
  if (!root) {
    throw new Error("The compile built no statement chunks, so there is no story to run.");
  }
  return new TestProgramStory(root);
}
