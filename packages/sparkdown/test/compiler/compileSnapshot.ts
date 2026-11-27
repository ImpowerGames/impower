import { Choice } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { Conditional } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { ContentList } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Divert } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { BinaryExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Expression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { NumberExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ObjectExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { UnaryExpression } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { FunctionCall } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Knot } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ReturnType } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { Sequence } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Sequence/Sequence";
import { SequenceType } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Sequence/SequenceType";
import { Stitch } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { StructDefinition } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StructPropertyDefinition } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Struct/StructPropertyDefinition";
import { Tag } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Text";
import { StorePropertyAssignment } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableAssignment } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { Weave } from "../../src/inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../src/compiler/classes/annotators/CompilationAnnotator";
import { collectDefineTypeNames } from "../../src/compiler/utils/collectDefineTypeNames";
import { scopeDefineInstances } from "../../src/compiler/utils/scopeDefineInstances";
import { createLowerContextFromSource } from "../../src/compiler/lower/context";
import { lower } from "../../src/compiler/lower/lower";
import { SparkdownSyntaxNodeRef } from "../../src/compiler/types/SparkdownSyntaxNodeRef";
import { parseSource } from "./grammarSnapshot";

interface LoweredEntry {
  name: string;
  from: number;
  to: number;
  text: string;
  block: CompiledBlock | undefined;
}

export function compileSource(source: string): LoweredEntry[] {
  const tree = parseSource(source);
  const ctx = createLowerContextFromSource(source);
  const defineTypeNames = collectDefineTypeNames(tree, (f, t) =>
    source.slice(f, t),
  );
  ctx.defineTypeNames = defineTypeNames;
  const entries: LoweredEntry[] = [];
  let child = tree.topNode.firstChild;
  while (child) {
    if (
      child.name !== "Newline" &&
      child.name !== "Whitespace" &&
      child.name !== "ExtraWhitespace" &&
      child.name !== "OptionalWhitespace" &&
      child.name !== "RequiredWhitespace" &&
      child.name !== "FrontMatter"
    ) {
      const nodeRef = child as unknown as SparkdownSyntaxNodeRef;
      entries.push({
        name: child.name,
        from: child.from,
        to: child.to,
        text: source.slice(child.from, child.to),
        block: lower(nodeRef, ctx),
      });
    }
    child = child.nextSibling;
  }
  for (const entry of entries) {
    if (entry.block?.content) {
      scopeDefineInstances(entry.block.content, defineTypeNames);
    }
  }
  return entries;
}

export function formatLoweredEntry(entry: LoweredEntry): string {
  if (entry.block === undefined) {
    return "(no lowerer)";
  }
  return JSON.stringify(blockToJson(entry.block), null, 2);
}

function blockToJson(block: CompiledBlock): unknown {
  const result: { [k: string]: unknown } = {};
  if (block.content !== undefined) {
    result["content"] = block.content.map(parsedObjectToJson);
  }
  if (block.diagnostics !== undefined && block.diagnostics.length > 0) {
    result["diagnostics"] = block.diagnostics.length;
  }
  if (block.uuid !== undefined) result["uuid"] = block.uuid;
  return result;
}

function parsedObjectToJson(obj: ParsedObject): unknown {
  if (obj instanceof Knot) {
    return flowToJson("Knot", obj);
  }
  if (obj instanceof Stitch) {
    return flowToJson("Stitch", obj);
  }
  if (obj instanceof Weave) {
    return {
      type: "Weave",
      content: obj.content?.map(parsedObjectToJson) ?? [],
    };
  }
  if (obj instanceof Divert) {
    return {
      type: "Divert",
      path: obj.pathIdentifiers?.map((p) => p.name) ?? [],
      isTunnel: obj.isTunnel,
      isThread: obj.isThread,
    };
  }
  if (obj instanceof Gather) {
    return {
      type: "Gather",
      name: obj.identifier?.name ?? null,
      depth: obj.indentationDepth,
    };
  }
  if (obj instanceof Choice) {
    return {
      type: "Choice",
      label: obj.identifier?.name ?? null,
      onceOnly: obj.onceOnly,
      inner: obj.innerContent?.content?.map(parsedObjectToJson) ?? [],
    };
  }
  if (obj instanceof Tag) {
    return { type: "Tag", start: obj.isStart };
  }
  if (obj instanceof Text) {
    return { type: "Text", text: obj.text };
  }
  if (obj instanceof VariableAssignment) {
    if (obj.structDefinition) {
      return {
        type: "VariableAssignment",
        name: obj.identifier?.name ?? null,
        struct: parsedObjectToJson(obj.structDefinition),
      };
    }
    const kind = obj.isGlobalDeclaration
      ? "global"
      : obj.isNewTemporaryDeclaration
        ? "temp"
        : "reassign";
    return {
      type: "VariableAssignment",
      kind,
      name: obj.identifier?.name ?? null,
      expression: expressionToJson(obj.expression),
    };
  }
  if (obj instanceof StorePropertyAssignment) {
    return {
      type: "StorePropertyAssignment",
      base: expressionToJson(obj.baseExpression),
      key: expressionToJson(obj.keyExpression),
      value: expressionToJson(obj.valueExpression),
    };
  }
  if (obj instanceof StructDefinition) {
    return {
      type: "StructDefinition",
      name: obj.name?.name ?? null,
      parent: obj.type?.name ?? null,
      props: obj.propertyDefinitions.map(parsedObjectToJson),
    };
  }
  if (obj instanceof StructPropertyDefinition) {
    return {
      type: "StructPropertyDefinition",
      name: obj.identifier?.name ?? null,
      expression: expressionToJson(obj.expression),
    };
  }
  if (obj instanceof Conditional) {
    return {
      type: "Conditional",
      init: expressionToJson(obj.initialCondition),
      branches: obj.branches.map(branchToJson),
    };
  }
  if (obj instanceof ConditionalSingleBranch) {
    return branchToJson(obj);
  }
  if (obj instanceof Sequence) {
    return {
      type: "Sequence",
      sequenceType: formatSequenceType(obj.sequenceType),
      elements: obj.sequenceElements.map(parsedObjectToJson),
    };
  }
  if (obj instanceof ContentList) {
    return {
      type: "ContentList",
      content: obj.content?.map(parsedObjectToJson) ?? [],
    };
  }
  if (obj instanceof ReturnType) {
    return {
      type: "ReturnType",
      expression: expressionToJson(obj.returnedExpression),
    };
  }
  if (obj instanceof Expression) {
    return expressionToJson(obj);
  }
  return { type: obj.constructor.name };
}

function flowToJson(typeName: "Knot" | "Stitch", flow: Knot | Stitch): unknown {
  const result: { [k: string]: unknown } = {
    type: typeName,
    name: flow.identifier?.name ?? null,
    args: flow.args?.map((a) => a.identifier?.name ?? null) ?? [],
    isFunction: flow.isFunction,
  };
  const rootWeave = flow._weave;
  if (rootWeave && rootWeave.content.length > 0) {
    result["body"] = rootWeave.content.map(parsedObjectToJson);
  }
  return result;
}

function branchToJson(branch: ConditionalSingleBranch): unknown {
  const bodyContent =
    branch.content?.filter((c) => c !== branch.ownExpression) ?? [];
  return {
    type: "ConditionalSingleBranch",
    isElse: branch.isElse,
    cond: branch.isElse ? null : expressionToJson(branch.ownExpression),
    body: bodyContent.map(parsedObjectToJson),
  };
}

function expressionToJson(expr: Expression | null | undefined): unknown {
  if (!expr) return null;
  if (expr instanceof NumberExpression) {
    return {
      type: "NumberExpression",
      value: expr.value,
      subtype: expr.subtype,
    };
  }
  if (expr instanceof StringExpression) {
    return {
      type: "StringExpression",
      content:
        expr.content?.map((c) => {
          if (c instanceof Text) return c.text;
          if (c instanceof Expression) return expressionToJson(c);
          return { type: c.constructor.name };
        }) ?? [],
    };
  }
  if (expr instanceof ObjectExpression) {
    return {
      type: "ObjectExpression",
      entries: expr.entries.map((e) => ({
        key: e.key,
        value: expressionToJson(e.value),
      })),
    };
  }
  if (expr instanceof IndexExpression) {
    return {
      type: "IndexExpression",
      base: expressionToJson(expr.baseExpression),
      key: expressionToJson(expr.keyExpression),
    };
  }
  if (expr instanceof VariableReference) {
    return { type: "VariableReference", path: expr.path };
  }
  if (expr instanceof FunctionCall) {
    return {
      type: "FunctionCall",
      name: expr.name,
      args: expr.args.map(expressionToJson),
    };
  }
  if (expr instanceof BinaryExpression) {
    return {
      type: "BinaryExpression",
      op: expr.opName,
      left: expressionToJson(expr.leftExpression),
      right: expressionToJson(expr.rightExpression),
    };
  }
  if (expr instanceof UnaryExpression) {
    return {
      type: "UnaryExpression",
      op: expr.op,
      operand: expressionToJson(expr.innerExpression),
    };
  }
  return { type: expr.constructor.name };
}

function formatSequenceType(t: SequenceType): string {
  const names: string[] = [];
  if (t & SequenceType.Shuffle) names.push("Shuffle");
  if (t & SequenceType.Once) names.push("Once");
  else if (t & SequenceType.Cycle) names.push("Cycle");
  else names.push("Stopping");
  return names.join("|");
}
