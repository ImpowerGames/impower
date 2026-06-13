import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";

// `screen NAME [as PARENT] with <element-tree> end` (and `component`).
// Both lower to a COMPILE-TIME struct only — no runtime objects — via the
// chunk's `context`, exactly like `style` (see lowerLuauStyle).
//
// The engine (UIModule.constructScreen) renders a screen/component struct
// as a nested <div> tree where each element is an object KEY whose
// space-separated tokens are CSS classes; a leaf whose class list
// includes `text` turns its string value into a text span. So an authored
// tree:
//
//   screen settings_menu with        context.screen.settings_menu = {
//     column #class=root               $type:"screen", $name:"settings_menu",
//       text #class=title "Settings"   $recursive:true,
//   end                                "root_0 root column": {
//                                        "title_1 title text": "Settings"
//                                      }
//                                    }
//
// Element key = `<uid> <#class values...> <tag>`, where uid =
// `<firstClass|tag>_<docIndex>` gives sibling-unique identity (the engine
// dedups children by name). The TAG becomes a class so `style <tag> with …`
// targets it (and the `text` tag IS the content-triggering class). Children
// nest by INDENTATION: the grammar emits a FLAT list of `LuauUIElement`
// nodes; we rebuild the tree from each element's indentation column with a
// parent stack (mirrors StructDefinition.BuildValue's `level` walk).
//
// Phase 2 = static structure only. Inline non-class `#props`, `@events`,
// and `{interpolation}` are parsed but NOT emitted (deferred — they need
// engine integration). `#class` (adds classes) and `#name` (overrides the
// uid base) ARE honored.

interface ParsedElement {
  indent: number;
  tag: string;
  classes: string[];
  name: string | null; // from #name=…, overrides the uid base
  content: string | null;
  index: number;
}

interface StackFrame {
  indent: number;
  obj: Record<string, unknown>;
  // Set once this frame's element is placed into its parent, so a
  // childless text element can be replaced by its raw content string.
  parent: Record<string, unknown> | null;
  key: string | null;
  content: string | null;
}

export function lowerLuauUI(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  uiType: "screen" | "component",
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const struct: Record<string, unknown> = {
    $type: uiType,
    $name: name,
    $recursive: true,
  };
  if (parent) {
    struct["$extends"] = parent;
  }

  const contentNode = findChildByName(nodeRef.node, `Luau${cap(uiType)}_content`);
  const elements: ParsedElement[] = [];
  if (contentNode) {
    let child: SyntaxNode | null = contentNode.firstChild;
    let index = 0;
    while (child) {
      if (child.name === "LuauUIElement") {
        const el = parseElement(child, ctx, index);
        if (el) {
          elements.push(el);
          index += 1;
        }
      }
      child = child.nextSibling;
    }
  }

  buildTree(elements, struct);

  return {
    content: [],
    context: { [uiType]: { [name]: struct } },
  };
}

function parseElement(
  node: SyntaxNode,
  ctx: LowerContext,
  index: number,
): ParsedElement | null {
  const tagNode = getDescendent("LuauUIElementTag", node);
  if (!tagNode) return null;
  const tag = ctx.read(tagNode.from, tagNode.to).trim();
  if (!tag) return null;
  // Indentation = the tag's column. Absolute indent doesn't matter — only
  // relative depth between sibling/child elements.
  const indent = ctx.characterNumber(tagNode.from);

  const classes: string[] = [];
  let name: string | null = null;
  let content: string | null = null;

  // Attributes and content live under the element's `_content` wrapper.
  const inner = findChildByName(node, "LuauUIElement_content") ?? node;
  let child: SyntaxNode | null = inner.firstChild;
  while (child) {
    if (child.name === "LuauUIAttribute") {
      const sigilNode = getDescendent("LuauUIAttributeSigil", child);
      const sigil = sigilNode ? ctx.read(sigilNode.from, sigilNode.to) : "#";
      const attrNameNode = getDescendent("LuauUIAttributeName", child);
      const attrName = attrNameNode
        ? ctx.read(attrNameNode.from, attrNameNode.to).trim()
        : "";
      const valueNode = getDescendent("LuauUIAttributeValue", child);
      const value = valueNode ? unquote(ctx.read(valueNode.from, valueNode.to)) : "";
      if (sigil === "#") {
        if (attrName === "class") {
          if (value) classes.push(...value.split(/\s+/).filter(Boolean));
        } else if (attrName === "name") {
          if (value) name = value;
        }
        // Other `#props` deferred to a later phase (inline style / data).
      }
      // `@events` deferred — parsed but not emitted.
    } else if (child.name === "LuauUIContent") {
      const textNode = getDescendent("LuauUIContentText", child);
      content = textNode ? ctx.read(textNode.from, textNode.to) : "";
    }
    child = child.nextSibling;
  }

  return { indent, tag, classes, name, content, index };
}

// Reconstruct the nested object tree from the flat, indentation-ordered
// element list and write it into `root`.
function buildTree(
  elements: ParsedElement[],
  root: Record<string, unknown>,
): void {
  const stack: StackFrame[] = [
    { indent: -1, obj: root, parent: null, key: null, content: null },
  ];
  const frames: StackFrame[] = [];

  for (const el of elements) {
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= el.indent) {
      stack.pop();
    }
    const parentFrame = stack[stack.length - 1]!;
    const key = elementKey(el);
    const childObj: Record<string, unknown> = {};
    parentFrame.obj[key] = childObj;
    const frame: StackFrame = {
      indent: el.indent,
      obj: childObj,
      parent: parentFrame.obj,
      key,
      content: el.content,
    };
    stack.push(frame);
    frames.push(frame);
  }

  // A childless element that carried text content becomes a string leaf
  // (the engine reads the value of a `text`-classed key as its content).
  for (const frame of frames) {
    if (
      frame.parent &&
      frame.key != null &&
      frame.content != null &&
      Object.keys(frame.obj).length === 0
    ) {
      frame.parent[frame.key] = frame.content;
    }
  }
}

// `<uid> <classes...> <tag>` — uid = `<firstClass|name|tag>_<index>` for
// sibling-unique identity; classes + tag give the CSS class list.
function elementKey(el: ParsedElement): string {
  const base = el.name ?? el.classes[0] ?? el.tag;
  const uid = `${base}_${el.index}`;
  return [uid, ...el.classes, el.tag].join(" ");
}

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
