import { RuntimeObject } from "./RuntimeObject";

export class Glue extends RuntimeObject {
  override Copy(): Glue {
    const obj = new Glue();
    return obj;
  }

  public toString(): "Glue" {
    return "Glue";
  }
}
