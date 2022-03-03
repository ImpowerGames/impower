import { Runner } from "../../../../impower-core";
import { InstanceData } from "../../../data";

export abstract class InstanceRunner<
  T extends InstanceData = InstanceData
> extends Runner<T> {
  getVariableIds(_data: T): string[] {
    return [];
  }

  opensGroup(_data: T): boolean {
    return false;
  }

  closesGroup(_data: T, _group?: InstanceData): boolean {
    return false;
  }
}
