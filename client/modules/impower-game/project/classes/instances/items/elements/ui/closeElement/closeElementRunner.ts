import { ElementData } from "../../../../../../../data";
import { ElementRunner } from "../../../element/elementRunner";

export class CloseElementRunner extends ElementRunner<
  ElementData<"CloseElement">
> {
  closesGroup(_data: ElementData<"CloseElement">): boolean {
    return true;
  }
}
