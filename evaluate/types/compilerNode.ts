import { CompilerToken } from "./compilerToken";

export interface CompilerNode {
  type: "node";
  left: CompilerNode | CompilerToken | null;
  right: CompilerNode | CompilerToken | null;
  operation: CompilerToken | null;
  grouped?: boolean;
}
