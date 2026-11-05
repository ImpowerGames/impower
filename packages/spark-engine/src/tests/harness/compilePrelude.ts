import { readFileSync } from "node:fs";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { programStoryOf } from "./compileProgram";

const BUILTINS_PRELUDE = readFileSync(
  new URL(
    "../../../../sparkdown/src/compiler/builtins/builtins.sd",
    import.meta.url,
  ),
  "utf8",
);

const PRELUDE_URI = "file:///__builtins__.sd";

export const compilePrelude = (
  edit: (prelude: string) => string = (prelude) => prelude,
) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    files: [
      {
        uri: PRELUDE_URI,
        type: "script",
        name: "__builtins__",
        ext: "sd",
        text: edit(BUILTINS_PRELUDE),
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: PRELUDE_URI } });
};

export const preludeContext = () =>
  buildDefinesContext(
    programStoryOf(compilePrelude().program, "prelude") as any,
  );
