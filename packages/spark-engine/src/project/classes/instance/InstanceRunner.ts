import { InstanceData, Runner } from "../../../data";
import { Game } from "../../../game";

export abstract class InstanceRunner<
  G extends Game,
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
    _game: G,
    _data: T,
    _context: {
      valueMap: Record<string, unknown>;
      typeMap: { [type: string]: Record<string, any> };
      instant?: boolean;
      debug?: boolean;
    }
  ): boolean {
    // NoOp
    return false;
  }
}
