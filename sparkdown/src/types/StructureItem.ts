interface Position {
  line: number;
  character: number;
}

export interface StructureItem {
  type: "section" | "scene" | "synopsis";
  info?: string;
  level?: number;
  text: string;
  tooltip?: string;
  id: string;
  range: {
    start: Position;
    end: Position;
  };
  children: StructureItem[];
}
