import { SparkDiagnostic } from "./SparkDiagnostic";
// import { SparkChunk } from "./SparkChunk";
// import { SparkProgramMetadata } from "./SparkProgramMetadata";
// import { SparkSection } from "./SparkSection";
// import { SparkToken } from "./SparkToken";
// import { SparkVariable } from "./SparkVariable";

export interface SparkProgram {
  compiled?: {
    root: any;
    listDefs?: any;
    structDefs?: { [type: string]: { [name: string]: any } };
  };
  diagnostics?: SparkDiagnostic[];
  sourceMap?: Record<string, { path: string }[]>;

  // TODO: Replace all references to these deprecated properties
  // frontMatter?: Record<string, string[]>;
  // chunks?: Record<string, SparkChunk>;
  // sections?: Record<string, SparkSection>;
  // variables?: Record<string, SparkVariable>;
  // tokens?: SparkToken[];
  // context?: { [type: string]: { [name: string]: any } };
  // stored?: string[];
  // metadata?: SparkProgramMetadata;
}
