import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";

export function wrapInWeave(content: ParsedObject[]): CompiledBlock {
  if (content.length === 0) {
    return {};
  }
  return { content: [new Weave(content)] };
}
