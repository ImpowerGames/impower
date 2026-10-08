import { Divert as RuntimeDivert } from "../../../../engine/Divert";
import { InkObject as RuntimeObject } from "../../../../../runtime/Object";

export class SequenceDivertToResolve {
  constructor(
    public divert: RuntimeDivert,
    public targetContent: RuntimeObject,
  ) {}
}
