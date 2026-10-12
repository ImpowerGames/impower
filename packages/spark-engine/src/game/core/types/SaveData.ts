export interface SaveData {
  modules: Record<string, any>;
  context: any;
  story: string;
  runtime: string;
  simulatedFrom?: string | null;
  /** For each data breakpoint that watched a variable a closure captured
   *  when the save was written, the breakpoint's data id, the id the
   *  story's save gave the variable's cell, and the tag the game gave that
   *  cell, so that a load binds the watch to the cell it reads under that id
   *  when the watch still holds the cell the tag names. Written only while
   *  such a breakpoint is set. */
  watchedCells?: { dataId: string; cell: number; tag: string }[];
}
