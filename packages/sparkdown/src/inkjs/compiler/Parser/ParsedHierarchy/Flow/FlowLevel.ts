export enum FlowLevel {
  Story, // 0
  Knot, // 1
  Stitch, // 2
  // A nestable callable scope — like Knot.isFunction but allowed to
  // live inside any other FlowBase. Path resolution permits same-level
  // nesting (Function inside Function), unlike Knot or Stitch.
  Function, // 3
  // not actually a FlowBase, but used for diverts
  WeavePoint, // 4
}
