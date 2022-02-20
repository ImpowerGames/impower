import { Color } from "../../../../../../../impower-core";
import { VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class ColorVariableRunner extends VariableRunner<
  VariableData<"ColorVariable", Color>
> {}
