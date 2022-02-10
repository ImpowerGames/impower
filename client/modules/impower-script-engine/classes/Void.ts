import { RuntimeObject } from "./RuntimeObject";

export class Void extends RuntimeObject {
  override Copy(): Void {
    return new Void();
  }
}
