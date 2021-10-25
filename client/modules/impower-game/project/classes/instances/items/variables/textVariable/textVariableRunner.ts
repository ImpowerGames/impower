import {
  TextFileReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class TextVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.TextVariable, TextFileReference>
> {}
