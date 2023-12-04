import { InstanceData, Runner } from "../../../data";

export abstract class InstanceRunner<
  T extends InstanceData = InstanceData
> extends Runner {
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
