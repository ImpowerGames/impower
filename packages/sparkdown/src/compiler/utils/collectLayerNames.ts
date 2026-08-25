import { SparkProgram } from "../types/SparkProgram";

const MAX_DEPTH = 32;

/** Elements the renderer creates on its own, named by the engine rather than by
 *  anything an author writes — so no layout declares them, yet a command can
 *  still aim at them. `foldout_label` is the `<summary>` every `foldout` gets
 *  (`IMPLICIT_LABEL_TAGS` in UIModule). */
const IMPLICIT_ELEMENT_NAMES = ["foldout_label"];

/** Every name an author can aim a `[[show/hide/animate <layer> …]]` command at.
 *
 *  The engine resolves such a target with `UIModule.findElements`, which walks
 *  the mounted tree and keeps a child when every space-separated token of the
 *  target appears among the tokens of that child's name. An element's name is
 *  its tag joined with its classes — `mask.shadow_1` mounts as `"mask shadow_1"`
 *  — and a command target is always a single token, because the grammar
 *  captures it as one run of non-space characters. So the targetable names are
 *  the individual TOKENS: both `mask` and `shadow_1` reach that element.
 *
 *  Names are gathered from the layouts the engine mounts: each layout's own
 *  name (a layout mounts as an element of that name), every element declared
 *  inside it, and the elements a component contributes wherever it is called.
 *  In a lowered layout struct an element is a key whose value is its content,
 *  so whether that value is an object or a scalar says only whether the element
 *  has content — it is an element either way, and both are collected. The
 *  Sparkle syntax tree is walked as well, since it carries elements a control
 *  block guards that the flattened struct need not contain.
 *
 *  Screens contribute nothing: a screen lowers to a name-only struct and mounts
 *  no element of its own, it only groups layouts for navigation. Component
 *  names are likewise absent — calling a component splices its children into
 *  the caller's parent without a wrapper element to aim at.
 *
 *  This accepts every DECLARED name, while the engine searches only what is
 *  currently MOUNTED, so a name belonging to a layout that is never opened
 *  passes here and finds nothing at runtime. That is the deliberate direction
 *  to err in: which layouts are open is a question about a moment during play,
 *  and no compile-time answer to it could be right. */
export const collectLayerNames = (program: SparkProgram): Set<string> => {
  const names = new Set<string>(IMPLICIT_ELEMENT_NAMES);
  const seenStructs = new WeakSet<object>();
  const seenNodes = new WeakSet<object>();
  // A component call's tag is the component's name, and calling one splices its
  // children into the caller's parent — there is no element of that name to aim
  // at, so it must not be collected as one.
  const componentNames = new Set(
    Object.keys(program.sparkle?.components ?? {}),
  );

  /** A lowered key is one or more dotted path segments, each of which is a tag
   *  followed by its classes. Every one of those tokens names the element. */
  const addName = (key: string) => {
    for (const segment of key.split(".")) {
      for (const token of segment.split(" ")) {
        if (token && !token.startsWith("$")) {
          names.add(token);
        }
      }
    }
  };

  const walkStruct = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (depth > MAX_DEPTH || seenStructs.has(value)) {
      return;
    }
    seenStructs.add(value);
    if (Array.isArray(value)) {
      // An array item's index is not a name, but elements declared inside one
      // still mount, so keep descending.
      for (const item of value) {
        walkStruct(item, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) {
        continue;
      }
      addName(key);
      walkStruct(child, depth + 1);
    }
  };

  /** Sparkle nodes nest through several shapes — an `if` holds branches, a
   *  `for` holds a body — so this walks the tree generically and picks up every
   *  element it passes, rather than enumerating node kinds that can change. */
  const walkAst = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (depth > MAX_DEPTH || seenNodes.has(value)) {
      return;
    }
    seenNodes.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, depth + 1);
      }
      return;
    }
    const node = value as { kind?: string; tag?: string; classes?: string[] };
    if (node.kind === "element") {
      if (typeof node.tag === "string" && !componentNames.has(node.tag)) {
        addName(node.tag);
      }
      for (const cls of node.classes ?? []) {
        addName(cls);
      }
    }
    for (const child of Object.values(value)) {
      walkAst(child, depth + 1);
    }
  };

  const layouts = program.context?.["layout"];
  if (layouts && typeof layouts === "object") {
    for (const [name, struct] of Object.entries(layouts)) {
      addName(name);
      walkStruct(struct, 0);
    }
  }
  const components = program.context?.["component"];
  if (components && typeof components === "object") {
    for (const struct of Object.values(components)) {
      walkStruct(struct, 0);
    }
  }
  walkAst(program.sparkle?.layouts, 0);
  walkAst(program.sparkle?.components, 0);

  // The root containers every layout and stylesheet is mounted into. Their
  // names are configurable, so read them rather than hard-coding "layouts".
  const ui = (program.context?.["config"] as any)?.["ui"];
  for (const key of ["layouts_element_name", "styles_element_name"]) {
    const name = ui?.[key];
    if (typeof name === "string" && name) {
      addName(name);
    }
  }

  return names;
};
