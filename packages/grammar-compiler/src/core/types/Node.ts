export interface Node {
  /** The type of node represented as a unique number. */
  typeIndex: number;

  /** The type of node represented as a unique string. */
  typeId: string;

  /** Props associated with this node. */
  props: Record<string, any>;
}
