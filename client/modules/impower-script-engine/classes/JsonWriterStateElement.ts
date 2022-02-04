import { JsonWriterState } from "../types/JsonWriterState";

export class JsonWriterStateElement {
  public type: JsonWriterState = "None";

  public childCount = 0;

  constructor(type: JsonWriterState) {
    this.type = type;
  }
}
