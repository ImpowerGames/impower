export type OperationType =
  // = & |
  | "LOGIC"
  // > < !
  | "COMPARISON"
  // ' "
  | "STRING"
  // + - * /
  | "MATH"
  // [ ]
  | "ARRAY"
  // { }
  | "MAP"
  // ,
  | "COMMA";
