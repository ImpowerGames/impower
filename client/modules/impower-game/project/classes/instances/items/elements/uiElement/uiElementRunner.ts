import { ElementTypeId, UIElementData } from "../../../../../../data";
import { ElementRunner } from "../../element/elementRunner";

export class UIElementRunner<
  T extends ElementTypeId = ElementTypeId
> extends ElementRunner<UIElementData<T>> {
  opensGroup(data: UIElementData<T>): boolean {
    return data.group;
  }
}
