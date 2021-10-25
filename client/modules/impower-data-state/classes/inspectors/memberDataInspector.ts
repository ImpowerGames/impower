import { getLabel } from "../../../impower-config";
import { Inspector } from "../../../impower-core";
import { MemberAccess } from "../../types/enums/memberAccess";
import { MemberData } from "../../types/interfaces/memberData";
import createMemberData from "../../utils/createMemberData";

export class MemberDataInspector implements Inspector<MemberData> {
  private static _instance: MemberDataInspector;

  public static get instance(): MemberDataInspector {
    if (!this._instance) {
      this._instance = new MemberDataInspector();
    }
    return this._instance;
  }

  createData(
    data?: Partial<MemberData> &
      Pick<MemberData, "g"> &
      Pick<MemberData, "access">
  ): MemberData {
    return createMemberData(data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    _data: MemberData,
    value: unknown
  ): string {
    if (propertyPath.endsWith("access")) {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return undefined;
  }

  getPropertyOptions(propertyPath: string, _data: MemberData): unknown[] {
    if (propertyPath.endsWith("access")) {
      return Object.values(MemberAccess);
    }
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    _data: MemberData,
    value: unknown
  ): string {
    if (propertyPath.endsWith("access")) {
      if (value === MemberAccess.Owner) {
        return "Can create/delete project and manage access";
      }
      if (value === MemberAccess.Editor) {
        return "Can edit project";
      }
      if (value === MemberAccess.Viewer) {
        return "Can view project";
      }
    }
    return undefined;
  }
}
