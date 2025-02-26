export interface SparkdownRuntimeFormat {
  root?: any;
  listDefs?: any;
  structDefs?: { [type: string]: { [name: string]: any } };
  uuidToSource?: Record<string, [file: number, line: number]>;
  uuidToPath?: Record<string, string>;
}
