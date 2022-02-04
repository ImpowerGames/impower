export type JsonWriterState =
  | "None"
  | "Object"
  | "Array"
  | "Property"
  | "PropertyName"
  | "String";
