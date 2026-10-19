import { DebugMetadata } from "./DebugMetadata";

/** The base of the runtime's values and of the few runtime objects the
 *  program engine still makes (`ControlCommand`, `Tag`, `Void`, `Choice`,
 *  `VariableAssignment`, `NativeFunctionCall`). */
export class InkObject {
  public parent: InkObject | null = null;

  get debugMetadata(): DebugMetadata | null {
    if (this._debugMetadata === null) {
      if (this.parent) {
        return this.parent.debugMetadata;
      }
    }

    return this._debugMetadata;
  }

  set debugMetadata(value) {
    this._debugMetadata = value;
  }

  get ownDebugMetadata() {
    return this._debugMetadata;
  }

  private _debugMetadata: DebugMetadata | null = null;

  public Copy(): InkObject {
    throw Error("Not Implemented: Doesn't support copying");
  }

  public Equals(obj: any) {
    return obj === this;
  }
}
