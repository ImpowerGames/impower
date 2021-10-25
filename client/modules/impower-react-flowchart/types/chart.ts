import { Vector2 } from "./generics";

export interface Chart {
  nodes: {
    [id: string]: Node;
  };
  links: {
    [id: string]: Link;
  };
}

export interface Node {
  id: string;
  defaultPosition: Vector2;
}

export interface Link {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}
