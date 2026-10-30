export interface ProgramChangeSummary {
  id: number;
  since?: number;
  changedFrom: { [uri: string]: number };
  confined: boolean;
  chunks?: ChunkChanges;
}

export interface ChunkChanges {
  dropped: number[];
  emitted: number[];
  moved: number[];
  initializers: boolean;
}
