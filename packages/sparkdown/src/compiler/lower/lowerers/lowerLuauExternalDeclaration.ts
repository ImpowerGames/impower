import { type SyntaxNode } from "@lezer/common";
import { ExternalDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";

// `external message(x)` — declaration of a host-bound callable. The parsed
// node has a function-name capture (`LuauFunctionDeclarationName` →
// `LuauFunctionName`) and a parenthesized parameter list
// (`LuauFunctionParameters` → `LuauFunctionParameter`* /
// `LuauVariadicParameter` / type annotations). The lowerer extracts the
// name + parameter names and produces an `ExternalDeclaration`, which
// inkjs's parsed-hierarchy `Story.AddExternal` collects into
// `Story.externals` during `GenerateRuntimeObject`. At call sites the
// regular Divert lowering already checks `Story.IsExternal(target)` and
// flips `runtimeDivert.isExternal = true` — no separate call-site work
// is needed here.
//
// Type annotations on parameters are accepted by the grammar (for editor
// hover / future static checking) but ignored by the lowerer: the runtime
// can't enforce them because host functions are arbitrary JavaScript.

export function lowerLuauExternalDeclaration(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const content = findChildByName(
    nodeRef.node,
    "LuauExternalDeclaration_content",
  );
  if (!content) return {};

  const nameNode = findDescendant(content, "LuauFunctionName");
  if (!nameNode) return {};
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return {};

  const paramsNode = findChildByName(content, "LuauFunctionParameters");
  const argNames: string[] = [];
  if (paramsNode) {
    const paramsContent = findChildByName(
      paramsNode,
      "LuauFunctionParameters_content",
    );
    if (paramsContent) {
      let c = paramsContent.firstChild;
      while (c) {
        if (
          c.name === "LuauFunctionParameter" ||
          c.name === "LuauVariadicParameter"
        ) {
          const text = ctx.read(c.from, c.to).trim();
          // `LuauFunctionParameter` matches just the identifier; for
          // `LuauVariadicParameter` (`...`) keep the literal ellipsis so
          // the parsed-hierarchy `ExternalDeclaration` records the
          // variadic marker. Inkjs's `BindExternalFunction` doesn't
          // enforce arity on variadic externals, so this is mostly
          // informational.
          if (text) argNames.push(text);
        }
        c = c.nextSibling;
      }
    }
  }

  const declaration = new ExternalDeclaration(new Identifier(name), argNames);
  return { content: [declaration] };
}

// Walk the subtree looking for the first node with `name`. Used to find
// `LuauFunctionName` underneath the wrapping `LuauFunctionDeclarationName`
// / `LuauFunctionDeclarationName_c1` structure without hardcoding the
// wrapper layout (which may change as the grammar evolves).
function findDescendant(
  start: SyntaxNode,
  name: string,
): SyntaxNode | null {
  const stack: SyntaxNode[] = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.name === name) return node;
    let child = node.firstChild;
    while (child) {
      stack.push(child);
      child = child.nextSibling;
    }
  }
  return null;
}
