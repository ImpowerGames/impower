interface Position {
  line: number;
  character: number;
}

export interface StructureItem {
  type: "section" | "scene";
  content: string;
  id: string;
  level: number;
  range: {
    start: Position;
    end: Position;
  };
  synopses: { synopsis: string; line: number }[];
  children: StructureItem[];
}
