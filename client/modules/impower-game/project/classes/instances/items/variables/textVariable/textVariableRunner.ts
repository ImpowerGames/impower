import { TextFileReference, VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class TextVariableRunner extends VariableRunner<
  VariableData<"TextVariable", TextFileReference>
> {}
