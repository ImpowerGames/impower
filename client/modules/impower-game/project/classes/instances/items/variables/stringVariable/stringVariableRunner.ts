import { VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class StringVariableRunner extends VariableRunner<
  VariableData<"StringVariable", string>
> {}
