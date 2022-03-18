import { ConfigData, PhysicsConfigData, TypeInfo } from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";
import { createPhysicsConfigData } from "./createPhysicsConfigData";

export class PhysicsConfigInspector extends ConfigInspector<PhysicsConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "Physics",
    };
  }

  createData(
    data?: Partial<PhysicsConfigData> & Pick<PhysicsConfigData, "reference">
  ): PhysicsConfigData {
    return createPhysicsConfigData(data);
  }

  getPropertyBounds(
    propertyPath: string,
    _data: PhysicsConfigData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "time.timeScale") {
      return {
        min: 0,
        max: 4,
        step: 0.25,
        marks: [
          { value: 0, label: "0" },
          { value: 1, label: "Normal" },
          { value: 2, label: "2x" },
          { value: 3, label: "3x" },
          { value: 4, label: "4x" },
        ],
      };
    }
    return undefined;
  }
}
