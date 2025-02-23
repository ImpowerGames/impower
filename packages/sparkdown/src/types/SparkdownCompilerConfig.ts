import { File } from "./File";

export type URI = string;

export interface SparkdownCompilerConfig {
  builtinDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  optionalDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  schemaDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  descriptionDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  files?: Record<URI, File>;
}
