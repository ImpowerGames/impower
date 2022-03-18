import { getLabel } from "../../../../../../impower-config";
import {
  CenterType,
  ConfigData,
  ScaleConfigData,
  ScaleModeType,
  TypeInfo,
} from "../../../../../data";
import { ConfigInspector } from "../../config/configInspector";
import { createScaleConfigData } from "./createScaleConfigData";

export class ScaleConfigInspector extends ConfigInspector<ScaleConfigData> {
  getTypeInfo(data?: ConfigData): TypeInfo {
    return {
      ...super.getTypeInfo(data),
      name: "Screen Scaling",
    };
  }

  createData(
    data?: Partial<ScaleConfigData> & Pick<ScaleConfigData, "reference">
  ): ScaleConfigData {
    return createScaleConfigData(data);
  }

  getPropertyOptions(propertyPath: string, _data?: ScaleConfigData): unknown[] {
    if (propertyPath === "mode") {
      return Object.values(ScaleModeType);
    }
    if (propertyPath === "autoCenter") {
      return Object.values(CenterType);
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ScaleConfigData,
    value: unknown
  ): string {
    if (propertyPath === "mode") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    if (propertyPath === "autoCenter") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyBounds(
    propertyPath: string,
    _data: ScaleConfigData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "width") {
      return {
        min: 1080,
        max: 1920,
        step: 10,
        marks: [
          { value: 1080, label: "9:16" },
          { value: 1920, label: "16:9" },
        ],
      };
    }
    if (propertyPath === "height") {
      return {
        min: 1080,
        max: 1920,
        step: 10,
        marks: [
          { value: 1080, label: "16:9" },
          { value: 1920, label: "9:16" },
        ],
      };
    }
    return undefined;
  }
}
