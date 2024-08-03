import { InkObject } from "../engine/Object";
import { SimpleJson } from "../engine/SimpleJson";

export interface ISerializationHandler {
  WriteRuntimeObject: (writer: SimpleJson.Writer, obj: InkObject) => boolean;
}
