import { DebugMetadata } from "../classes/DebugMetadata";
import { Path } from "../classes/Path";

export interface IObject {
  path: Path;
  debugMetadata: DebugMetadata;
  parent: IObject;
}
