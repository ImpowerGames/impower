import {
  createDynamicData,
  InputCondition,
  Key,
  PressedKeyTriggerData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class PressedKeyTriggerInspector extends TriggerInspector<PressedKeyTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Pressed Key",
      icon: "keyboard",
      color: getProjectColor("cyan", 5),
      description: "A keyboard key was pressed",
    };
  }

  getSummary(_data: PressedKeyTriggerData): string {
    return "{key} {action}";
  }

  createData(
    data?: Partial<PressedKeyTriggerData> &
      Pick<PressedKeyTriggerData, "reference">
  ): PressedKeyTriggerData {
    return {
      key: createDynamicData(Key.Unidentified),
      action: InputCondition.Started,
      ...super.createData(data),
      repeatable: true,
      ...data,
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: PressedKeyTriggerData,
    value: unknown
  ): string {
    if (propertyPath === "key") {
      if (value === Key.Unidentified) {
        return "(Any)";
      }
      return `${value}`;
    }
    if (propertyPath === "action") {
      if (value === InputCondition.Started) {
        return "Down";
      }
      if (value === InputCondition.Stopped) {
        return "Up";
      }
      return "Held";
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(
    propertyPath: string,
    _data?: PressedKeyTriggerData
  ): unknown[] {
    if (propertyPath === "key") {
      return Object.values(Key);
    }
    if (propertyPath === "action") {
      return Object.values(InputCondition);
    }
    return undefined;
  }
}
