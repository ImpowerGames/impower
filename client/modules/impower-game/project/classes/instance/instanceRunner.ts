import { Runner } from "../../../../impower-core";
import { InstanceData } from "../../../data";

export abstract class InstanceRunner<
  T extends InstanceData = InstanceData
> extends Runner<T> {
  opensGroup(_data: T): boolean {
    return false;
  }

  closesGroup(_data: T, _group?: InstanceData): boolean {
    return false;
  }
}
