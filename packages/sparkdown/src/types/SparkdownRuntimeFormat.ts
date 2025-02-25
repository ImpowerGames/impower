export interface SparkdownRuntimeFormat {
  root: any;
  listDefs?: any;
  structDefs?: { [type: string]: { [name: string]: any } };
}
