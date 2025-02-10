import { NodeProp } from "@lezer/common";
import { Compiler } from "../../../../grammar-compiler/src";

export const cachedCompilerProp = new NodeProp<Compiler>({ perNode: true });
