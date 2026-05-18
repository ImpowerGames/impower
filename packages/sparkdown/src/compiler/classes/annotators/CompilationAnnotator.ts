import { Range } from "@codemirror/state";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { InkParser } from "../../../inkjs/compiler/Parser/InkParser";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { SourceMetadata } from "../../../inkjs/engine/Error";
import { lower } from "../../lower/lower";
import { type SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { populateDefinedStructs } from "../../utils/populateDefinedStructs";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const FILE_HANDLER = {
  ResolveInkFilename: () => "",
  LoadInkFileContents: () => "",
};
const ROOT_PARSER = new InkParser("", null, null, null, FILE_HANDLER);
const NOOP = () => {};

let id = 1;
const generateUUID = () => {
  return `${id++}`;
};

export interface InkDiagnostic {
  message: string;
  severity: ErrorType;
  source: SourceMetadata | null;
  // Optional LSP `DiagnosticTag` values (1 = Unnecessary, 2 = Deprecated).
  // The Unnecessary tag is what VS Code uses to render diagnostics
  // faded out — used here for unreachable code after `done` / `fin`.
  tags?: number[];
}

export interface CompiledBlock {
  diagnostics?: InkDiagnostic[];
  content?: ParsedObject[];
  include?: string;
  // Path (without `.luau` extension) for a `run "path"` statement.
  // Compiler resolves the file, wraps its body in a function-call
  // knot, and emits an invocation. See SparkdownCompiler's `run`
  // handling.
  run?: string;
  context?: {
    [type: string]: { [name: string]: any };
  };
  contextPropertyRegistry?: {
    [type: string]: { [name: string]: { [propertyPath: string]: any } };
  };
  defaultDefinitions?: { [type: string]: any };
  json?: string;
  uuid?: string;
}

export interface CompilationConfig {
  definitions?: {
    builtins?: {
      [type: string]: {
        [name: string]: any;
      };
    };
  };
}

export class CompilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<CompiledBlock>,
  CompilationConfig
> {
  override enter(
    annotations: Range<SparkdownAnnotation<CompiledBlock>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<CompiledBlock>>[] {
    if (
      nodeRef.node.parent?.type.isTop &&
      nodeRef.name !== "Newline" &&
      nodeRef.name !== "Whitespace" &&
      nodeRef.name !== "ExtraWhitespace" &&
      nodeRef.name !== "OptionalWhitespace" &&
      nodeRef.name !== "RequiredWhitespace" &&
      nodeRef.name !== "FrontMatter"
    ) {
      // Snapshot the chunk's absolute start line so the lowerer can produce
      // chunk-relative debug metadata. `text.lineAt(pos).number` is 1-based,
      // so subtract 1 to get a 0-based absolute line. The 0-based chunk-
      // relative line is `(absolute-line) - (chunk-start-absolute-line)`.
      // Compiler's `offsetDebugMetadata` later re-adds the chunk offset.
      const text = this.text;
      const chunkStartLine0 = text ? text.lineAt(nodeRef.from).number - 1 : 0;
      const lowered = lower(nodeRef, {
        read: (from, to) => this.read(from, to),
        lineNumber: (pos) =>
          text ? text.lineAt(pos).number - 1 - chunkStartLine0 : 0,
        characterNumber: (pos) => {
          if (!text) return 0;
          const line = text.lineAt(pos);
          return pos - line.from;
        },
        config: this.config,
      });
      if (lowered !== undefined) {
        annotations.push(
          SparkdownAnnotation.mark(lowered).range(nodeRef.from, nodeRef.to),
        );
      } else if (
        nodeRef.name === "DefineViewDeclaration" ||
        nodeRef.name === "DefineStylingDeclaration" ||
        nodeRef.name === "DefinePlainDeclaration"
      ) {
        const text = this.read(nodeRef.from, nodeRef.to);
        const diagnostics: InkDiagnostic[] = [];
        const parser = new InkParser(
          text,
          null,
          (message, severity, source) => {
            diagnostics.push({ message, severity, source });
          },
          ROOT_PARSER,
          FILE_HANDLER,
        );
        const story = parser.ParseStory();
        const context = {};
        const contextPropertyRegistry = {};
        let defaultDefinitions: { [type: string]: any } | undefined = undefined;
        try {
          const runtimeStory = story.ExportRuntime(
            (message, severity, source) => {
              diagnostics.push({ message, severity, source });
            },
          );
          if (runtimeStory?.structDefinitions) {
            populateDefinedStructs(
              context,
              contextPropertyRegistry,
              runtimeStory?.structDefinitions,
              this.config?.definitions?.builtins,
            );
            for (const [type, structs] of Object.entries(
              runtimeStory.structDefinitions,
            )) {
              for (const [name, struct] of Object.entries(structs)) {
                if (name === "$default") {
                  defaultDefinitions ??= {};
                  defaultDefinitions[type] ??= struct;
                }
              }
            }
          }
        } catch (e) {
          console.error(e);
        }
        annotations.push(
          SparkdownAnnotation.mark({
            diagnostics,
            content: story.content,
            context,
            contextPropertyRegistry,
            defaultDefinitions,
          }).range(nodeRef.from, nodeRef.to),
        );
      } else {
        const text = this.read(nodeRef.from, nodeRef.to);
        const diagnostics: InkDiagnostic[] = [];
        const parser = new InkParser(
          text,
          null,
          (message, severity, source) => {
            diagnostics.push({ message, severity, source });
          },
          ROOT_PARSER,
          FILE_HANDLER,
        );
        const story = parser.ParseStory();
        let json: string | undefined = undefined;
        try {
          json = story.ExportRuntime(NOOP)?.ToJson() as string;
        } catch (e) {
          console.error(e);
        }
        annotations.push(
          SparkdownAnnotation.mark({
            diagnostics,
            content: story.content,
            json,
            uuid: generateUUID(),
          }).range(nodeRef.from, nodeRef.to),
        );
      }
    }
    return annotations;
  }

  override end(
    iterateFrom: number,
    iterateTo: number,
    added: Range<SparkdownAnnotation<CompiledBlock>>[],
    removed: Range<SparkdownAnnotation<CompiledBlock>>[],
  ): void {
    for (let i = 0; i < added.length; i++) {
      const add = added[i]!;
      const remove = removed[i];
      if (add.value.type.uuid != null) {
        if (add?.value.type.json === remove?.value.type.json) {
          // No change, carry forward uuid
          add.value.type.uuid = remove?.value.type.uuid ?? generateUUID();
        } else {
          // The compiled json has changed, generate a new uuid
          add.value.type.uuid = generateUUID();
        }
      }
    }
  }
}
