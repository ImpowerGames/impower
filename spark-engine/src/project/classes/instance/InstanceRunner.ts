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

  onPreview(
    _data: T,
    _context?: {
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
      instant?: boolean;
      debug?: boolean;
    }
  ): boolean {
    // NoOp
    return false;
  }
}
