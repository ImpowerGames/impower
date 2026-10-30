import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { CompilationConfig } from "../classes/annotators/CompilationAnnotator";
import type { RootLocals } from "../utils/rootLocals";
import type { SparkleJoins } from "./utils/sparkleContinuations";

export interface LoweringRead {
  kind: "routing" | "unreachable" | "rootLocal" | "rootDeclaration" | "rootLocalIgnoringBlocks";
  value: string;
  node: string;
  from: number;
}

export interface LowerContext {
  recordRead?: (read: LoweringRead) => void;
  read: (from: number, to: number) => string;
  documentText?: () => string;
  lineNumber: (pos: number) => number;
  characterNumber: (pos: number) => number;
  filePath?: string;
  chunkFrom?: number;
  sparkleOwner?: string;
  config?: CompilationConfig;
  hoistedKnots?: ParsedObject[];
  sparkleLoopVars?: string[];
  localConsts?: boolean;
  functionBindingsStack?: import("./utils/functionBindings").FunctionBinding[][];
  sparkleJoins?: SparkleJoins;
  stampExpressionSpans?: boolean;
  functionScopeStack?: ParsedObject[][];
  diagnostics?: import("../classes/annotators/CompilationAnnotator").InkDiagnostic[];
  loopStack?: {
    continueLabel: string;
    breakLabel: string;
    scopeDepth?: number;
  }[];
  scopeDepth?: number;
  blockDepth?: number;
  globalCallableNames?: Pick<ReadonlySet<string>, "has">;
  rootLocals?: Pick<RootLocals, "answer" | "answerIgnoringBlocks" | "blockLocal" | "declared">;
  defineTypeNames?: Pick<ReadonlySet<string>, "has">;
  declaredLocalsStack?: Set<string>[];
  siblingSubFlowNamesStack?: Map<string, SiblingSubFlowInfo>[];
  statementStack?: import("./utils/statementShape").StatementShape[];
  statementMemo?: import("./statementMemo").StatementMemoSession;
}

export interface SiblingSubFlowInfo {
  rebound: true;
}

export function createLowerContextFromSource(
  source: string,
  config?: CompilationConfig,
): LowerContext {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      lineStarts.push(i + 1);
    }
  }
  const lineFor = (pos: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    read: (from, to) => source.slice(from, to),
    documentText: () => source,
    lineNumber: (pos) => lineFor(pos),
    characterNumber: (pos) => pos - lineStarts[lineFor(pos)]!,
    config,
  };
}
