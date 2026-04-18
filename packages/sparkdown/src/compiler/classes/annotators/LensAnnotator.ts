import { Range } from "@codemirror/state";
import { InkParser } from "../../../inkjs/compiler/Parser/InkParser";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const FILE_HANDLER = {
  ResolveInkFilename: () => "",
  LoadInkFileContents: () => "",
};
const ROOT_PARSER = new InkParser("", null, null, null, FILE_HANDLER);
const NOOP = () => {};

export interface Lens {
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
  data?: unknown;
}

export class LensAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Lens>
> {
  declarationNode?: { from: number; to: number };
  declarationStruct?: any;

  override enter(
    annotations: Range<SparkdownAnnotation<Lens>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Lens>>[] {
    if (
      nodeRef.name === "DefinePlainDeclaration" ||
      nodeRef.name === "DefineViewDeclaration" ||
      nodeRef.name === "DefineStylingDeclaration"
    ) {
      const text = this.read(nodeRef.from, nodeRef.to);
      this.declarationNode = { from: nodeRef.from, to: nodeRef.to };
      const parser = new InkParser(text, null, NOOP, ROOT_PARSER, FILE_HANDLER);
      const story = parser.ParseStory();
      try {
        const runtimeStory = story.ExportRuntime(NOOP);
        if (runtimeStory?.structDefinitions) {
          for (const [, structs] of Object.entries(
            runtimeStory.structDefinitions,
          )) {
            for (const [, struct] of Object.entries(structs)) {
              this.declarationStruct = struct;
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (nodeRef.name === "DefineTypeName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (text === "synth") {
        if (this.declarationNode) {
          // TODO: Support inspecting structs
          // annotations.push(
          //   SparkdownAnnotation.mark({
          //     command: {
          //       title: "$(info) Inspect",
          //       command: "sparkdown.inspect",
          //       arguments: [this.declarationStruct],
          //     },
          //   }).range(this.declarationNode.from, this.declarationNode.to),
          // );
        }
      }
      return annotations;
    }
    return annotations;
  }
}
