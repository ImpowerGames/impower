import { InputCondition, TypeInfo } from "../../../../../../../data";
import { ClickButton } from "../../../../../../../data/enums/clickButton";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { ClickTriggerData } from "./clickTriggerData";

export class ClickTriggerInspector extends TriggerInspector<ClickTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Clicked",
      icon: "mouse",
      color: getProjectColor("cyan", 5),
      description: "Trigger when clicking",
    };
  }

  getSummary(_data: ClickTriggerData): string {
    return "{action}";
  }

  createData(
    data?: Partial<ClickTriggerData> & Pick<ClickTriggerData, "reference">
  ): ClickTriggerData {
    return {
      button: ClickButton.Button0,
      action: InputCondition.Started,
      ...super.createData(data),
      repeatable: true,
      ...data,
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ClickTriggerData,
    value: unknown
  ): string {
    if (propertyPath === "action") {
      if (value === InputCondition.Started) {
        return "Down";
      }
      if (value === InputCondition.Stopped) {
        return "Up";
      }
      return "Held";
    }
    if (propertyPath === "button") {
      if (value === ClickButton.Button1) {
        return "Button 1";
      }
      if (value === ClickButton.Button2) {
        return "Button 2";
      }
      return "Button 0";
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(
    propertyPath: string,
    _data?: ClickTriggerData
  ): unknown[] {
    if (propertyPath === "action") {
      return Object.values(InputCondition);
    }
    if (propertyPath === "button") {
      return Object.values(ClickButton);
    }
    return undefined;
  }
}
