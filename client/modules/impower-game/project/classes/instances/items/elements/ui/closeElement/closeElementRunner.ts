import { ElementData, ElementTypeId } from "../../../../../../../data";
import { ElementRunner } from "../../../element/elementRunner";

export class CloseElementRunner extends ElementRunner<
  ElementData<ElementTypeId.CloseElement>
> {
  closesGroup(_data: ElementData<ElementTypeId.CloseElement>): boolean {
    return true;
  }
}
