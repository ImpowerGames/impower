import { BlockReference, VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class BlockVariableRunner extends VariableRunner<
  VariableData<"BlockVariable", BlockReference>
> {}
