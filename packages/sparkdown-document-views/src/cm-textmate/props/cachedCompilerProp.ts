import { NodeProp } from "@lezer/common";
import { Compiler } from "../../../../grammar-compiler/src/compiler/classes/Compiler";

export const cachedCompilerProp = new NodeProp<Compiler>({ perNode: true });
