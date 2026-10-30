import type { SourceMetadata } from "../../runtime/Error";
import type { StructDefinitionTable } from "../../runtime/StructDefinition";

export interface SparkdownCompilerState {
  defaultDefinitions?: { [type: string]: any };
  produced?: boolean;
  structDefinitions?: StructDefinitionTable;
  projectScripts?: string[];
  sparkleDeclaredAt?: Map<string, { uri: string; source: SourceMetadata }>;
  fileResolutionState?: {
    currentParentUri: string;
    runStack?: string[];
    runDeclared?: Set<string>;
    runFiles?: Map<string, string>;
  };
}
