import { NodeProp } from "@lezer/common";
import { Compiler } from "../../compiler/classes/Compiler";

export const cachedCompilerProp = new NodeProp<Compiler>({ perNode: true });
