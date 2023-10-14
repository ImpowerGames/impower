/**
 * Lezer-Parser <https://github.com/lezer-parser/common>
 *
 * Copyright (c) 2018 Marijn Haverbeke <marijn@haverbeke.berlin> and others
 * Released under the MIT License.
 */

import { NodeID } from "../../core";
import { Side } from "../enums/Side";
import { ITreeBuffer } from "../types/ITreeBuffer";
import { checkSide } from "../utils/checkSide";
import FlatBufferCursor from "./FlatBufferCursor";
import TreeBuffer from "./TreeBuffer";

export type NodeType = number;

export const isAnonymousNode = (type: NodeType) => type === NodeID.none;

export const isErrorNode = (type: NodeType) =>
  type === NodeID.incomplete || type === NodeID.unrecognized;

/// The default maximum length of a `TreeBuffer` node.
export const DefaultBufferLength = 1024;

export class Range {
  constructor(readonly from: number, readonly to: number) {}
}

const CachedNode = new WeakMap<Tree, SyntaxNode>(),
  CachedInnerNode = new WeakMap<Tree, SyntaxNode>();

/// Options that control iteration. Can be combined with the `|`
/// operator to enable multiple ones.
export enum IterMode {
  /// When enabled, iteration will only visit [`Tree`](#common.Tree)
  /// objects, not nodes packed into
  /// [`TreeBuffer`](#common.TreeBuffer)s.
  ExcludeBuffers = 1,
  /// Enable this to make iteration include anonymous nodes (such as
  /// the nodes that wrap repeated grammar constructs into a balanced
  /// tree).
  IncludeAnonymous = 2,
  /// By default, regular [mounted](#common.NodeProp^mounted) nodes
  /// replace their base node in iteration. Enable this to ignore them
  /// instead.
  IgnoreMounts = 4,
  /// This option only applies in
  /// [`enter`](#common.SyntaxNode.enter)-style methods. It tells the
  /// library to not enter mounted overlays if one covers the given
  /// position.
  IgnoreOverlays = 8,
}

/// A piece of syntax tree. There are two ways to approach these
/// trees: the way they are actually stored in memory, and the
/// convenient way.
///
/// Syntax trees are stored as a tree of `Tree` and `TreeBuffer`
/// objects. By packing detail information into `TreeBuffer` leaf
/// nodes, the representation is made a lot more memory-efficient.
///
/// However, when you want to actually work with tree nodes, this
/// representation is very awkward, so most client code will want to
/// use the [`TreeCursor`](#common.TreeCursor) or
/// [`SyntaxNode`](#common.SyntaxNode) interface instead, which provides
/// a view on some part of this data structure, and can be used to
/// move around to adjacent nodes.
export class Tree {
  /// @internal
  props: null | { [id: number]: any } = null;

  /// Construct a new tree. See also [`Tree.build`](#common.Tree^build).
  constructor(
    /// The type of the top node.
    readonly type: NodeType,
    /// This node's child nodes.
    readonly children: readonly (Tree | TreeBuffer)[],
    /// The positions (offsets relative to the start of this tree) of
    /// the children.
    readonly positions: readonly number[],
    /// The total length of this tree
    readonly length: number
  ) {}

  /// The empty tree
  static empty = new Tree(NodeID.none, [], [], 0);

  /// Get a [tree cursor](#common.TreeCursor) positioned at the top of
  /// the tree. Mode can be used to [control](#common.IterMode) which
  /// nodes the cursor visits.
  cursor(mode: IterMode = 0 as IterMode) {
    return new TreeCursor(this.topNode as TreeNode, mode);
  }

  /// Get a [tree cursor](#common.TreeCursor) pointing into this tree
  /// at the given position and side (see
  /// [`moveTo`](#common.TreeCursor.moveTo).
  cursorAt(pos: number, side: -1 | 0 | 1 = 0): TreeCursor {
    let scope = CachedNode.get(this) || this.topNode;
    let cursor = new TreeCursor(scope as TreeNode | BufferNode);
    cursor.moveTo(pos, side);
    CachedNode.set(this, cursor._tree as SyntaxNode);
    return cursor;
  }

  /// Get a [syntax node](#common.SyntaxNode) object for the top of the
  /// tree.
  get topNode(): SyntaxNode {
    return new TreeNode(this, 0, 0, null) as SyntaxNode;
  }

  /// Get the [syntax node](#common.SyntaxNode) at the given position.
  /// If `side` is -1, this will move into nodes that end at the
  /// position. If 1, it'll move into nodes that start at the
  /// position. With 0, it'll only enter nodes that cover the position
  /// from both sides.
  ///
  /// Note that this will not enter
  /// [overlays](#common.MountedTree.overlay), and you often want
  /// [`resolveInner`](#common.Tree.resolveInner) instead.
  resolve(pos: number, side: -1 | 0 | 1 = 0) {
    let node = resolveNode(
      CachedNode.get(this) || this.topNode,
      pos,
      side,
      false
    );
    CachedNode.set(this, node);
    return node;
  }

  /// Like [`resolve`](#common.Tree.resolve), but will enter
  /// [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
  /// pointing into the innermost overlaid tree at the given position
  /// (with parent links going through all parent structure, including
  /// the host trees).
  resolveInner(pos: number, side: -1 | 0 | 1 = 0) {
    let node = resolveNode(
      CachedInnerNode.get(this) || this.topNode,
      pos,
      side,
      true
    );
    CachedInnerNode.set(this, node);
    return node;
  }

  /// In some situations, it can be useful to iterate through all
  /// nodes around a position, including those in overlays that don't
  /// directly cover the position. This method gives you an iterator
  /// that will produce all nodes, from small to big, around the given
  /// position.
  resolveStack(pos: number, side: -1 | 0 | 1 = 0): NodeIterator {
    return stackIterator(this, pos, side);
  }

  /// Iterate over the tree and its children, calling `enter` for any
  /// node that touches the `from`/`to` region (if given) before
  /// running over such a node's children, and `leave` (if given) when
  /// leaving the node. When `enter` returns `false`, that node will
  /// not have its children iterated over (or `leave` called).
  iterate(spec: {
    enter(node: SyntaxNodeRef): boolean | void;
    leave?(node: SyntaxNodeRef): void;
    from?: number;
    to?: number;
    mode?: IterMode;
  }) {
    let { enter, leave, from = 0, to = this.length } = spec;
    let mode = spec.mode || 0,
      anon = (mode & IterMode.IncludeAnonymous) > 0;
    for (let c = this.cursor(mode | IterMode.IncludeAnonymous); ; ) {
      let entered = false;
      if (
        c.from <= to &&
        c.to >= from &&
        ((!anon && isAnonymousNode(c.type)) || enter(c) !== false)
      ) {
        if (c.firstChild()) continue;
        entered = true;
      }
      for (;;) {
        if (entered && leave && (anon || !isAnonymousNode(c.type))) leave(c);
        if (c.nextSibling()) break;
        if (!c.parent()) return;
        entered = true;
      }
    }
  }

  /// Balance the direct children of this tree, producing a copy of
  /// which may have children grouped into subtrees with type
  /// [`NodeType.none`](#common.NodeType^none).
  balance(
    config: {
      /// Function to create the newly balanced subtrees.
      makeTree?: (
        children: readonly (Tree | TreeBuffer)[],
        positions: readonly number[],
        length: number
      ) => Tree;
    } = {}
  ) {
    return this.children.length <= Balance.BranchFactor
      ? this
      : balanceRange(
          NodeID.none,
          this.children,
          this.positions,
          0,
          this.children.length,
          0,
          this.length,
          (children, positions, length) =>
            new Tree(this.type, children, positions, length),
          config.makeTree ||
            ((children, positions, length) =>
              new Tree(NodeID.none, children, positions, length))
        );
  }

  /// Build a tree from a postfix-ordered buffer of node information,
  /// or a cursor over such a buffer.
  static build(data: BuildData) {
    return buildTree(data);
  }
}

/// Represents a sequence of nodes.
export type NodeIterator = { node: SyntaxNode; next: NodeIterator | null };

type BuildData = {
  /// The buffer or buffer cursor to read the node data from.
  ///
  /// When this is an array, it should contain four values for every
  /// node in the tree.
  ///
  ///  - The first holds the node's type, as a node ID pointing into
  ///    the given `NodeSet`.
  ///  - The second holds the node's start offset.
  ///  - The third the end offset.
  ///  - The fourth the amount of space taken up in the array by this
  ///    node and its children. Since there's four values per node,
  ///    this is the total number of nodes inside this node (children
  ///    and transitive children) plus one for the node itself, times
  ///    four.
  ///
  /// Parent nodes should appear _after_ child nodes in the array. As
  /// an example, a node of type 10 spanning positions 0 to 4, with
  /// two children, of type 11 and 12, might look like this:
  ///
  ///     [11, 0, 1, 4, 12, 2, 4, 4, 10, 0, 4, 12]
  buffer: BufferCursor | Int32Array;
  /// The id of the top node type.
  topID: number;
  /// The position the tree should start at. Defaults to 0.
  start?: number;
  /// The position in the buffer where the function should stop
  /// reading. Defaults to 0.
  bufferStart?: number;
  /// The length of the wrapping node. The end offset of the last
  /// child is used when not provided.
  length?: number;
  /// The maximum buffer length to use. Defaults to
  /// [`DefaultBufferLength`](#common.DefaultBufferLength).
  maxBufferLength?: number;
  /// An optional array holding reused nodes that the buffer can refer
  /// to.
  reused?: readonly (Tree | ITreeBuffer)[];
  /// The first node type that indicates repeat constructs in this
  /// grammar.
  minRepeatType?: number;
};

/// This is used by `Tree.build` as an abstraction for iterating over
/// a tree buffer. A cursor initially points at the very last element
/// in the buffer. Every time `next()` is called it moves on to the
/// previous one.
export interface BufferCursor {
  /// The current buffer position (four times the number of nodes
  /// remaining).
  pos: number;
  /// The node ID of the next node in the buffer.
  id: number;
  /// The start position of the next node in the buffer.
  start: number;
  /// The end position of the next node.
  end: number;
  /// The size of the next node (the number of nodes inside, counting
  /// the node itself, times 4).
  size: number;
  /// Moves `this.pos` down by 4.
  next(): void;
  /// Create a copy of this cursor.
  fork(): BufferCursor;
}

/// The set of properties provided by both [`SyntaxNode`](#common.SyntaxNode)
/// and [`TreeCursor`](#common.TreeCursor). Note that, if you need
/// an object that is guaranteed to stay stable in the future, you
/// need to use the [`node`](#common.SyntaxNodeRef.node) accessor.
export interface SyntaxNodeRef {
  /// The start position of the node.
  readonly from: number;
  /// The end position of the node.
  readonly to: number;
  /// The type of the node.
  readonly type: NodeType;
  /// Get the [tree](#common.Tree) that represents the current node,
  /// if any. Will return null when the node is in a [tree
  /// buffer](#common.TreeBuffer).
  readonly tree: Tree | null;
  /// Retrieve a stable [syntax node](#common.SyntaxNode) at this
  /// position.
  readonly node: SyntaxNode;
}

/// A syntax node provides an immutable pointer to a given node in a
/// tree. When iterating over large amounts of nodes, you may want to
/// use a mutable [cursor](#common.TreeCursor) instead, which is more
/// efficient.
export interface SyntaxNode extends SyntaxNodeRef {
  /// The node's parent node, if any.
  parent: SyntaxNode | null;
  /// The first child, if the node has children.
  firstChild: SyntaxNode | null;
  /// The node's last child, if available.
  lastChild: SyntaxNode | null;
  /// The first child that ends after `pos`.
  childAfter(pos: number): SyntaxNode | null;
  /// The last child that starts before `pos`.
  childBefore(pos: number): SyntaxNode | null;
  /// Enter the child at the given position. If side is -1 the child
  /// may end at that position, when 1 it may start there.
  ///
  /// This will by default enter
  /// [overlaid](#common.MountedTree.overlay)
  /// [mounted](#common.NodeProp^mounted) trees. You can set
  /// `overlays` to false to disable that.
  ///
  /// Similarly, when `buffers` is false this will not enter
  /// [buffers](#common.TreeBuffer), only [nodes](#common.Tree) (which
  /// is mostly useful when looking for props, which cannot exist on
  /// buffer-allocated nodes).
  enter(pos: number, side: -1 | 0 | 1, mode?: IterMode): SyntaxNode | null;
  /// This node's next sibling, if any.
  nextSibling: SyntaxNode | null;
  /// This node's previous sibling.
  prevSibling: SyntaxNode | null;
  /// A [tree cursor](#common.TreeCursor) starting at this node.
  cursor(mode?: IterMode): TreeCursor;
  /// Find the node around, before (if `side` is -1), or after (`side`
  /// is 1) the given position. Will look in parent nodes if the
  /// position is outside this node.
  resolve(pos: number, side?: -1 | 0 | 1): SyntaxNode;
  /// Similar to `resolve`, but enter
  /// [overlaid](#common.MountedTree.overlay) nodes.
  resolveInner(pos: number, side?: -1 | 0 | 1): SyntaxNode;
  /// Move the position to the innermost node before `pos` that looks
  /// like it is unfinished (meaning it ends in an error node or has a
  /// child ending in an error node right at its end).
  enterUnfinishedNodesBefore(pos: number): SyntaxNode;
  /// Get a [tree](#common.Tree) for this node. Will allocate one if it
  /// points into a buffer.
  toTree(): Tree;

  /// Get the first child of the given type (which may be a [node
  /// name](#common.NodeType.name) or a [group
  /// name](#common.NodeProp^group)). If `before` is non-null, only
  /// return children that occur somewhere after a node with that name
  /// or group. If `after` is non-null, only return children that
  /// occur somewhere before a node with that name or group.
  getChild(
    type: string | number,
    before?: string | number | null,
    after?: string | number | null
  ): SyntaxNode | null;

  /// Like [`getChild`](#common.SyntaxNode.getChild), but return all
  /// matching children, not just the first.
  getChildren(
    type: string | number,
    before?: string | number | null,
    after?: string | number | null
  ): SyntaxNode[];
}

function resolveNode(
  node: SyntaxNode,
  pos: number,
  side: -1 | 0 | 1,
  overlays: boolean
): SyntaxNode {
  // Move up to a node that actually holds the position, if possible
  while (
    node.from == node.to ||
    (side < 1 ? node.from >= pos : node.from > pos) ||
    (side > -1 ? node.to <= pos : node.to < pos)
  ) {
    let parent =
      !overlays && node instanceof TreeNode && node.index < 0
        ? null
        : node.parent;
    if (!parent) return node;
    node = parent;
  }
  let mode = overlays ? 0 : IterMode.IgnoreOverlays;
  // Must go up out of overlays when those do not overlap with pos
  if (overlays) {
    for (
      let scan: SyntaxNode | null = node, parent = scan.parent;
      parent;
      scan = parent, parent = scan.parent
    ) {
      if (
        scan instanceof TreeNode &&
        scan.index < 0 &&
        parent.enter(pos, side, mode)?.from != scan.from
      )
        node = parent;
    }
  }
  for (;;) {
    let inner = node.enter(pos, side, mode);
    if (!inner) return node;
    node = inner;
  }
}

abstract class BaseNode implements SyntaxNode {
  abstract from: number;
  abstract to: number;
  abstract type: NodeType;
  abstract tree: Tree | null;
  abstract parent: SyntaxNode | null;
  abstract firstChild: SyntaxNode | null;
  abstract lastChild: SyntaxNode | null;
  abstract childAfter(pos: number): SyntaxNode | null;
  abstract childBefore(pos: number): SyntaxNode | null;
  abstract enter(
    pos: number,
    side: -1 | 0 | 1,
    mode?: IterMode
  ): SyntaxNode | null;
  abstract nextSibling: SyntaxNode | null;
  abstract prevSibling: SyntaxNode | null;
  abstract toTree(): Tree;

  cursor(mode: IterMode = 0 as IterMode) {
    return new TreeCursor(this as any, mode);
  }

  getChild(
    type: NodeType,
    before: NodeType | null = null,
    after: NodeType | null = null
  ) {
    let r = getChildren(this as SyntaxNode, type, before, after);
    return r.length ? r[0]! : null;
  }

  getChildren(
    type: NodeType,
    before: NodeType | null = null,
    after: NodeType | null = null
  ): SyntaxNode[] {
    return getChildren(this as SyntaxNode, type, before, after);
  }

  resolve(pos: number, side: -1 | 0 | 1 = 0): SyntaxNode {
    return resolveNode(this as SyntaxNode, pos, side, false);
  }

  resolveInner(pos: number, side: -1 | 0 | 1 = 0): SyntaxNode {
    return resolveNode(this as SyntaxNode, pos, side, true);
  }

  enterUnfinishedNodesBefore(pos: number) {
    let scan = this.childBefore(pos),
      node: SyntaxNode = this as SyntaxNode;
    while (scan) {
      let last = scan.lastChild;
      if (!last || last.to != scan.to) break;
      if (isErrorNode(last.type) && last.from == last.to) {
        node = scan;
        scan = last.prevSibling;
      } else {
        scan = last;
      }
    }
    return node;
  }

  get node() {
    return this;
  }

  get next() {
    return this.parent;
  }
}

export class TreeNode extends BaseNode implements SyntaxNode {
  constructor(
    readonly _tree: Tree,
    readonly from: number,
    // Index in parent node, set to -1 if the node is not a direct child of _parent.node (overlay)
    readonly index: number,
    readonly _parent: TreeNode | null
  ) {
    super();
  }

  get type() {
    return this._tree.type;
  }

  get to() {
    return this.from + this._tree.length;
  }

  nextChild(
    i: number,
    dir: 1 | -1,
    pos: number,
    side: Side,
    mode: IterMode = 0 as IterMode
  ): TreeNode | BufferNode | null {
    for (let parent: TreeNode = this; ; ) {
      for (
        let { children, positions } = parent._tree,
          e = dir > 0 ? children.length : -1;
        i != e;
        i += dir
      ) {
        let next = children[i]!,
          start = positions[i]! + parent.from;
        if (!next || !checkSide(side, pos, start, start + next.length))
          continue;
        if (next instanceof TreeBuffer) {
          if (mode & IterMode.ExcludeBuffers) continue;
          let index = next.findChild(
            0,
            next.buffer.length,
            dir,
            pos - start,
            side
          );
          if (index > -1)
            return new BufferNode(
              new BufferContext(parent, next, i, start),
              null,
              index
            );
        } else if (
          mode & IterMode.IncludeAnonymous ||
          !isAnonymousNode(next.type) ||
          hasChild(next)
        ) {
          let inner = new TreeNode(next, start, i, parent);
          return mode & IterMode.IncludeAnonymous ||
            !isAnonymousNode(inner.type)
            ? inner
            : inner.nextChild(
                dir < 0 ? next.children.length - 1 : 0,
                dir,
                pos,
                side
              );
        }
      }
      if (mode & IterMode.IncludeAnonymous || !isAnonymousNode(parent.type))
        return null;
      if (parent.index >= 0) i = parent.index + dir;
      else i = dir < 0 ? -1 : parent._parent!._tree.children.length;
      parent = parent._parent!;
      if (!parent) return null;
    }
  }

  get firstChild() {
    return this.nextChild(0, 1, 0, Side.DontCare);
  }
  get lastChild() {
    return this.nextChild(this._tree.children.length - 1, -1, 0, Side.DontCare);
  }

  childAfter(pos: number) {
    return this.nextChild(0, 1, pos, Side.After);
  }
  childBefore(pos: number) {
    return this.nextChild(this._tree.children.length - 1, -1, pos, Side.Before);
  }

  enter(pos: number, side: -1 | 0 | 1, mode = 0) {
    return this.nextChild(0, 1, pos, side, mode);
  }

  nextSignificantParent() {
    let val: TreeNode = this;
    while (isAnonymousNode(val.type) && val._parent) val = val._parent;
    return val;
  }

  get parent(): TreeNode | null {
    return this._parent ? this._parent.nextSignificantParent() : null;
  }

  get nextSibling(): SyntaxNode | null {
    return this._parent && this.index >= 0
      ? this._parent.nextChild(this.index + 1, 1, 0, Side.DontCare)
      : null;
  }
  get prevSibling(): SyntaxNode | null {
    return this._parent && this.index >= 0
      ? this._parent.nextChild(this.index - 1, -1, 0, Side.DontCare)
      : null;
  }

  get tree() {
    return this._tree;
  }

  toTree() {
    return this._tree;
  }
}

function getChildren(
  node: SyntaxNode,
  type: NodeType,
  before: NodeType | null,
  after: NodeType | null
): SyntaxNode[] {
  let cur = node.cursor(),
    result: SyntaxNode[] = [];
  if (!cur.firstChild()) return result;
  if (before != null)
    while (cur.type !== before) if (!cur.nextSibling()) return result;
  for (;;) {
    if (after != null && cur.type === after) return result;
    if (cur.type === type) result.push(cur.node);
    if (!cur.nextSibling()) return after == null ? result : [];
  }
}

class BufferContext {
  constructor(
    readonly parent: TreeNode,
    readonly buffer: TreeBuffer,
    readonly index: number,
    readonly start: number
  ) {}
}

class BufferNode extends BaseNode {
  type: NodeType;

  get from() {
    return this.context.start + this.context.buffer.buffer[this.index + 1]!;
  }

  get to() {
    return this.context.start + this.context.buffer.buffer[this.index + 2]!;
  }

  constructor(
    readonly context: BufferContext,
    readonly _parent: BufferNode | null,
    readonly index: number
  ) {
    super();
    this.type = context.buffer.buffer[index]!;
  }

  child(dir: 1 | -1, pos: number, side: Side): BufferNode | null {
    let { buffer } = this.context;
    let index = buffer.findChild(
      this.index + 4,
      buffer.buffer[this.index + 3]!,
      dir,
      pos - this.context.start,
      side
    );
    return index < 0 ? null : new BufferNode(this.context, this, index);
  }

  get firstChild() {
    return this.child(1, 0, Side.DontCare);
  }
  get lastChild() {
    return this.child(-1, 0, Side.DontCare);
  }

  childAfter(pos: number) {
    return this.child(1, pos, Side.After);
  }
  childBefore(pos: number) {
    return this.child(-1, pos, Side.Before);
  }

  enter(pos: number, side: -1 | 0 | 1, mode: IterMode = 0 as IterMode) {
    if (mode & IterMode.ExcludeBuffers) return null;
    let { buffer } = this.context;
    let index = buffer.findChild(
      this.index + 4,
      buffer.buffer[this.index + 3]!,
      side > 0 ? 1 : -1,
      pos - this.context.start,
      side
    );
    return index < 0 ? null : new BufferNode(this.context, this, index);
  }

  get parent(): SyntaxNode | null {
    return this._parent || this.context.parent.nextSignificantParent();
  }

  externalSibling(dir: 1 | -1) {
    return this._parent
      ? null
      : this.context.parent.nextChild(
          this.context.index + dir,
          dir,
          0,
          Side.DontCare
        );
  }

  get nextSibling(): SyntaxNode | null {
    let { buffer } = this.context;
    let after = buffer.buffer[this.index + 3]!;
    if (
      after <
      (this._parent
        ? buffer.buffer[this._parent.index + 3]!
        : buffer.buffer.length)
    )
      return new BufferNode(this.context, this._parent, after);
    return this.externalSibling(1);
  }

  get prevSibling(): SyntaxNode | null {
    let { buffer } = this.context;
    let parentStart = this._parent ? this._parent.index + 4 : 0;
    if (this.index == parentStart) return this.externalSibling(-1);
    return new BufferNode(
      this.context,
      this._parent,
      buffer.findChild(parentStart, this.index, -1, 0, Side.DontCare)
    );
  }

  get tree() {
    return null;
  }

  toTree() {
    let children = [],
      positions = [];
    let { buffer } = this.context;
    let startI = this.index + 4,
      endI = buffer.buffer[this.index + 3]!;
    if (endI > startI) {
      let from = buffer.buffer[this.index + 1]!;
      children.push(buffer.slice(startI, endI, from));
      positions.push(0);
    }
    return new Tree(this.type, children, positions, this.to - this.from);
  }
}

function iterStack(heads: readonly SyntaxNode[]): NodeIterator | null {
  if (!heads.length) return null;
  let pick = 0,
    picked = heads[0]!;
  for (let i = 1; i < heads.length; i++) {
    let node = heads[i]!;
    if (node.from > picked.from || node.to < picked.to) {
      picked = node;
      pick = i;
    }
  }
  let next =
    picked instanceof TreeNode && picked.index < 0 ? null : picked.parent;
  let newHeads = heads.slice();
  if (next) newHeads[pick] = next;
  else newHeads.splice(pick, 1);
  return new StackIterator(newHeads, picked);
}

class StackIterator implements NodeIterator {
  constructor(
    readonly heads: readonly SyntaxNode[],
    readonly node: SyntaxNode
  ) {}
  get next() {
    return iterStack(this.heads);
  }
}

function stackIterator(
  tree: Tree,
  pos: number,
  side: -1 | 0 | 1
): NodeIterator {
  let inner = tree.resolveInner(pos, side),
    layers: SyntaxNode[] | null = null;
  for (
    let scan: TreeNode | null =
      inner instanceof TreeNode ? inner : (inner as BufferNode).context.parent;
    scan;
    scan = scan.parent
  ) {
    if (scan.index < 0) {
      // This is an overlay root
      let parent: TreeNode | null = scan.parent!;
      (layers || (layers = [inner])).push(parent.resolve(pos, side));
      scan = parent;
    }
  }
  return layers ? iterStack(layers) : (inner as any);
}

/// A tree cursor object focuses on a given node in a syntax tree, and
/// allows you to move to adjacent nodes.
export class TreeCursor implements SyntaxNodeRef {
  /// The node's type.
  type!: NodeType;

  /// The start source offset of this node.
  from!: number;

  /// The end source offset.
  to!: number;

  /// @internal
  _tree!: TreeNode;
  /// @internal
  buffer: BufferContext | null = null;
  private stack: number[] = [];
  /// @internal
  index: number = 0;
  private bufferNode: BufferNode | null = null;

  /// @internal
  constructor(
    node: TreeNode | BufferNode,
    /// @internal
    readonly mode = 0
  ) {
    if (node instanceof TreeNode) {
      this.yieldNode(node);
    } else {
      this._tree = node.context.parent;
      this.buffer = node.context;
      for (let n: BufferNode | null = node._parent; n; n = n._parent)
        this.stack.unshift(n.index);
      this.bufferNode = node;
      this.yieldBuf(node.index);
    }
  }

  private yieldNode(node: TreeNode | null) {
    if (!node) return false;
    this._tree = node;
    this.type = node.type;
    this.from = node.from;
    this.to = node.to;
    return true;
  }

  private yieldBuf(index: number, type?: NodeType) {
    this.index = index;
    let { start, buffer } = this.buffer!;
    this.type = type || buffer.buffer[index]!;
    this.from = start + buffer.buffer[index + 1]!;
    this.to = start + buffer.buffer[index + 2]!;
    return true;
  }

  private yield(node: TreeNode | BufferNode | null) {
    if (!node) return false;
    if (node instanceof TreeNode) {
      this.buffer = null;
      return this.yieldNode(node);
    }
    this.buffer = node.context;
    return this.yieldBuf(node.index, node.type);
  }

  /// @internal
  enterChild(dir: 1 | -1, pos: number, side: Side) {
    if (!this.buffer)
      return this.yield(
        this._tree.nextChild(
          dir < 0 ? this._tree._tree.children.length - 1 : 0,
          dir,
          pos,
          side,
          this.mode
        )
      );

    let { buffer } = this.buffer;
    let index = buffer.findChild(
      this.index + 4,
      buffer.buffer[this.index + 3]!,
      dir,
      pos - this.buffer.start,
      side
    );
    if (index < 0) return false;
    this.stack.push(this.index);
    return this.yieldBuf(index);
  }

  /// Move the cursor to this node's first child. When this returns
  /// false, the node has no child, and the cursor has not been moved.
  firstChild() {
    return this.enterChild(1, 0, Side.DontCare);
  }

  /// Move the cursor to this node's last child.
  lastChild() {
    return this.enterChild(-1, 0, Side.DontCare);
  }

  /// Move the cursor to the first child that ends after `pos`.
  childAfter(pos: number) {
    return this.enterChild(1, pos, Side.After);
  }

  /// Move to the last child that starts before `pos`.
  childBefore(pos: number) {
    return this.enterChild(-1, pos, Side.Before);
  }

  /// Move the cursor to the child around `pos`. If side is -1 the
  /// child may end at that position, when 1 it may start there. This
  /// will also enter [overlaid](#common.MountedTree.overlay)
  /// [mounted](#common.NodeProp^mounted) trees unless `overlays` is
  /// set to false.
  enter(pos: number, side: -1 | 0 | 1, mode: IterMode = this.mode) {
    if (!this.buffer) return this.yield(this._tree.enter(pos, side, mode));
    return mode & IterMode.ExcludeBuffers
      ? false
      : this.enterChild(1, pos, side);
  }

  /// Move to the node's parent node, if this isn't the top node.
  parent() {
    if (!this.buffer)
      return this.yieldNode(
        this.mode & IterMode.IncludeAnonymous
          ? this._tree._parent
          : this._tree.parent
      );
    if (this.stack.length) return this.yieldBuf(this.stack.pop()!);
    let parent =
      this.mode & IterMode.IncludeAnonymous
        ? this.buffer.parent
        : this.buffer.parent.nextSignificantParent();
    this.buffer = null;
    return this.yieldNode(parent);
  }

  /// @internal
  sibling(dir: 1 | -1) {
    if (!this.buffer)
      return !this._tree._parent
        ? false
        : this.yield(
            this._tree.index < 0
              ? null
              : this._tree._parent.nextChild(
                  this._tree.index + dir,
                  dir,
                  0,
                  Side.DontCare,
                  this.mode
                )
          );

    let { buffer } = this.buffer,
      d = this.stack.length - 1;
    if (dir < 0) {
      let parentStart = d < 0 ? 0 : this.stack[d]! + 4;
      if (this.index != parentStart)
        return this.yieldBuf(
          buffer.findChild(parentStart, this.index, -1, 0, Side.DontCare)
        );
    } else {
      let after = buffer.buffer[this.index + 3]!;
      if (
        after <
        (d < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d]! + 3]!)
      )
        return this.yieldBuf(after);
    }
    return d < 0
      ? this.yield(
          this.buffer.parent.nextChild(
            this.buffer.index + dir,
            dir,
            0,
            Side.DontCare,
            this.mode
          )
        )
      : false;
  }

  /// Move to this node's next sibling, if any.
  nextSibling() {
    return this.sibling(1);
  }

  /// Move to this node's previous sibling, if any.
  prevSibling() {
    return this.sibling(-1);
  }

  private atLastNode(dir: 1 | -1) {
    let index,
      parent: TreeNode | null,
      { buffer } = this;
    if (buffer) {
      if (dir > 0) {
        if (this.index < buffer.buffer.buffer.length) return false;
      } else {
        for (let i = 0; i < this.index; i++)
          if (buffer.buffer.buffer[i + 3]! < this.index) return false;
      }
      ({ index, parent } = buffer);
    } else {
      ({ index, _parent: parent } = this._tree);
    }
    for (; parent; { index, _parent: parent } = parent) {
      if (index > -1)
        for (
          let i = index + dir, e = dir < 0 ? -1 : parent._tree.children.length;
          i != e;
          i += dir
        ) {
          let child = parent._tree.children[i]!;
          if (
            this.mode & IterMode.IncludeAnonymous ||
            child instanceof TreeBuffer ||
            !isAnonymousNode(child.type) ||
            hasChild(child)
          )
            return false;
        }
    }
    return true;
  }

  private move(dir: 1 | -1, enter: boolean) {
    if (enter && this.enterChild(dir, 0, Side.DontCare)) return true;
    for (;;) {
      if (this.sibling(dir)) return true;
      if (this.atLastNode(dir) || !this.parent()) return false;
    }
  }

  /// Move to the next node in a
  /// [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
  /// traversal, going from a node to its first child or, if the
  /// current node is empty or `enter` is false, its next sibling or
  /// the next sibling of the first parent node that has one.
  next(enter = true) {
    return this.move(1, enter);
  }

  /// Move to the next node in a last-to-first pre-order traveral. A
  /// node is followed by its last child or, if it has none, its
  /// previous sibling or the previous sibling of the first parent
  /// node that has one.
  prev(enter = true) {
    return this.move(-1, enter);
  }

  /// Move the cursor to the innermost node that covers `pos`. If
  /// `side` is -1, it will enter nodes that end at `pos`. If it is 1,
  /// it will enter nodes that start at `pos`.
  moveTo(pos: number, side: -1 | 0 | 1 = 0) {
    // Move up to a node that actually holds the position, if possible
    while (
      this.from == this.to ||
      (side < 1 ? this.from >= pos : this.from > pos) ||
      (side > -1 ? this.to <= pos : this.to < pos)
    )
      if (!this.parent()) break;

    // Then scan down into child nodes as far as possible
    while (this.enterChild(1, pos, side)) {}
    return this;
  }

  /// Get a [syntax node](#common.SyntaxNode) at the cursor's current
  /// position.
  get node(): SyntaxNode {
    if (!this.buffer) return this._tree;

    let cache = this.bufferNode,
      result: BufferNode | null = null,
      depth = 0;
    if (cache && cache.context == this.buffer) {
      scan: for (let index = this.index, d = this.stack.length; d >= 0; ) {
        for (let c: BufferNode | null = cache; c; c = c._parent)
          if (c.index == index) {
            if (index == this.index) return c;
            result = c;
            depth = d + 1;
            break scan;
          }
        index = this.stack[--d]!;
      }
    }
    for (let i = depth; i < this.stack.length; i++)
      result = new BufferNode(this.buffer, result, this.stack[i]!);
    return (this.bufferNode = new BufferNode(this.buffer, result, this.index));
  }

  /// Get the [tree](#common.Tree) that represents the current node, if
  /// any. Will return null when the node is in a [tree
  /// buffer](#common.TreeBuffer).
  get tree(): Tree | null {
    return this.buffer ? null : this._tree._tree;
  }

  /// Iterate over the current node and all its descendants, calling
  /// `enter` when entering a node and `leave`, if given, when leaving
  /// one. When `enter` returns `false`, any children of that node are
  /// skipped, and `leave` isn't called for it.
  iterate(
    enter: (node: SyntaxNodeRef) => boolean | void,
    leave?: (node: SyntaxNodeRef) => void
  ) {
    for (let depth = 0; ; ) {
      let mustLeave = false;
      if (isAnonymousNode(this.type) || enter(this) !== false) {
        if (this.firstChild()) {
          depth++;
          continue;
        }
        if (!isAnonymousNode(this.type)) mustLeave = true;
      }
      for (;;) {
        if (mustLeave && leave) leave(this);
        mustLeave = isAnonymousNode(this.type);
        if (this.nextSibling()) break;
        if (!depth) return;
        this.parent();
        depth--;
        mustLeave = true;
      }
    }
  }
}

function hasChild(tree: Tree): boolean {
  return tree.children.some(
    (ch) =>
      ch instanceof TreeBuffer || !isAnonymousNode(ch.type) || hasChild(ch)
  );
}

const enum Balance {
  BranchFactor = 8,
}

const enum SpecialRecord {
  Reuse = -1,
  ContextChange = -3,
  LookAhead = -4,
}

function buildTree(data: BuildData) {
  let { buffer, maxBufferLength = DefaultBufferLength, reused = [] } = data;
  let cursor = Array.isArray(buffer)
    ? new FlatBufferCursor(buffer as Int32Array, buffer.length)
    : (buffer as BufferCursor);

  function takeNode(
    parentStart: number,
    minPos: number,
    children: (Tree | TreeBuffer)[],
    positions: number[],
    inRepeat: number
  ) {
    let { id, start, end, size } = cursor;
    while (size < 0) {
      cursor.next();
      if (size == SpecialRecord.Reuse) {
        let node = reused[id]!;
        const child =
          node instanceof Tree
            ? node
            : new TreeBuffer(node.buffer, node.length);
        children.push(child);
        positions.push(start - parentStart);
        return;
      } else {
        throw new RangeError(`Unrecognized record size: ${size}`);
      }
      ({ id, start, end, size } = cursor);
    }

    let type = id,
      node,
      buffer: { size: number; start: number; skip: number } | undefined;
    let startPos = start - parentStart;
    if (
      end - start <= maxBufferLength &&
      (buffer = findBufferSize(cursor.pos - minPos, inRepeat))
    ) {
      // Small enough for a buffer, and no reused nodes inside
      let data = new Uint16Array(buffer.size - buffer.skip);
      let endPos = cursor.pos - buffer.size,
        index = data.length;
      while (cursor.pos > endPos)
        index = copyToBuffer(buffer.start, data, index);
      node = new TreeBuffer(data, end - buffer.start);
      startPos = buffer.start - parentStart;
    } else {
      // Make it a node
      let endPos = cursor.pos - size;
      cursor.next();
      let localChildren: (Tree | TreeBuffer)[] = [],
        localPositions: number[] = [];
      let localInRepeat = -1;
      let lastGroup = 0,
        lastEnd = end;
      while (cursor.pos > endPos) {
        if (
          localInRepeat >= 0 &&
          cursor.id == localInRepeat &&
          cursor.size >= 0
        ) {
          if (cursor.end <= lastEnd - maxBufferLength) {
            makeRepeatLeaf(
              localChildren,
              localPositions,
              start,
              lastGroup,
              cursor.end,
              lastEnd,
              localInRepeat
            );
            lastGroup = localChildren.length;
            lastEnd = cursor.end;
          }
          cursor.next();
        } else {
          takeNode(start, endPos, localChildren, localPositions, localInRepeat);
        }
      }
      if (
        localInRepeat >= 0 &&
        lastGroup > 0 &&
        lastGroup < localChildren.length
      )
        makeRepeatLeaf(
          localChildren,
          localPositions,
          start,
          lastGroup,
          start,
          lastEnd,
          localInRepeat
        );
      localChildren.reverse();
      localPositions.reverse();

      if (localInRepeat > -1 && lastGroup > 0) {
        let make = makeBalanced(type);
        node = balanceRange(
          type,
          localChildren,
          localPositions,
          0,
          localChildren.length,
          0,
          end - start,
          make,
          make
        );
      } else {
        node = makeTree(type, localChildren, localPositions, end - start);
      }
    }

    children.push(node);
    positions.push(startPos);
  }

  function makeBalanced(type: NodeType) {
    return (
      children: readonly (Tree | TreeBuffer)[],
      positions: readonly number[],
      length: number
    ) => {
      let lastI = children.length - 1,
        last;
      if (lastI >= 0 && (last = children[lastI]) instanceof Tree) {
        if (!lastI && last.type == type && last.length == length) return last;
      }
      return makeTree(type, children, positions, length);
    };
  }

  function makeRepeatLeaf(
    children: (Tree | TreeBuffer)[],
    positions: number[],
    base: number,
    i: number,
    from: number,
    to: number,
    type: number
  ) {
    let localChildren = [],
      localPositions = [];
    while (children.length > i) {
      localChildren.push(children.pop()!);
      localPositions.push(positions.pop()! + base - from);
    }
    children.push(makeTree(type, localChildren, localPositions, to - from));
    positions.push(from - base);
  }

  function makeTree(
    type: NodeType,
    children: readonly (Tree | TreeBuffer)[],
    positions: readonly number[],
    length: number
  ) {
    return new Tree(type, children, positions, length);
  }

  function findBufferSize(maxSize: number, inRepeat: number) {
    // Scan through the buffer to find previous siblings that fit
    // together in a TreeBuffer, and don't contain any reused nodes
    // (which can't be stored in a buffer).
    // If `inRepeat` is > -1, ignore node boundaries of that type for
    // nesting, but make sure the end falls either at the start
    // (`maxSize`) or before such a node.
    let fork = cursor.fork();
    let size = 0,
      start = 0,
      skip = 0,
      minStart = fork.end - maxBufferLength;
    let result = { size: 0, start: 0, skip: 0 };
    scan: for (let minPos = fork.pos - maxSize; fork.pos > minPos; ) {
      let nodeSize = fork.size;
      // Pretend nested repeat nodes of the same type don't exist
      if (fork.id == inRepeat && nodeSize >= 0) {
        // Except that we store the current state as a valid return
        // value.
        result.size = size;
        result.start = start;
        result.skip = skip;
        skip += 4;
        size += 4;
        fork.next();
        continue;
      }
      let startPos = fork.pos - nodeSize;
      if (nodeSize < 0 || startPos < minPos || fork.start < minStart) break;
      let localSkipped = 0;
      let nodeStart = fork.start;
      fork.next();
      while (fork.pos > startPos) {
        if (fork.size < 0) {
          if (fork.size == SpecialRecord.ContextChange) localSkipped += 4;
          else break scan;
        }
        fork.next();
      }
      start = nodeStart;
      size += nodeSize;
      skip += localSkipped;
    }
    if (inRepeat < 0 || size == maxSize) {
      result.size = size;
      result.start = start;
      result.skip = skip;
    }
    return result.size > 4 ? result : undefined;
  }

  function copyToBuffer(
    bufferStart: number,
    buffer: Uint16Array,
    index: number
  ): number {
    let { id, start, end, size } = cursor;
    cursor.next();
    if (size >= 0) {
      let startIndex = index;
      if (size > 4) {
        let endPos = cursor.pos - (size - 4);
        while (cursor.pos > endPos)
          index = copyToBuffer(bufferStart, buffer, index);
      }
      buffer[--index] = startIndex;
      buffer[--index] = end - bufferStart;
      buffer[--index] = start - bufferStart;
      buffer[--index] = id;
    } else {
      throw new RangeError(`Unrecognized record size: ${size}`);
    }
    return index;
  }

  let children: (Tree | TreeBuffer)[] = [],
    positions: number[] = [];
  while (cursor.pos > 0)
    takeNode(data.start || 0, data.bufferStart || 0, children, positions, -1);
  let length =
    data.length ?? (children.length ? positions[0]! + children[0]!.length : 0);
  return new Tree(data.topID, children.reverse(), positions.reverse(), length);
}

const nodeSizeCache: WeakMap<Tree, number> = new WeakMap();
function nodeSize(balanceType: NodeType, node: Tree | TreeBuffer): number {
  if (
    !isAnonymousNode(balanceType) ||
    node instanceof TreeBuffer ||
    node.type != balanceType
  )
    return 1;
  let size = nodeSizeCache.get(node);
  if (size == null) {
    size = 1;
    for (let child of node.children) {
      if (child.type != balanceType || !(child instanceof Tree)) {
        size = 1;
        break;
      }
      size += nodeSize(balanceType, child);
    }
    nodeSizeCache.set(node, size);
  }
  return size;
}

function balanceRange(
  // The type the balanced tree's inner nodes.
  balanceType: NodeType,
  // The direct children and their positions
  children: readonly (Tree | TreeBuffer)[],
  positions: readonly number[],
  // The index range in children/positions to use
  from: number,
  to: number,
  // The start position of the nodes, relative to their parent.
  start: number,
  // Length of the outer node
  length: number,
  // Function to build the top node of the balanced tree
  mkTop:
    | ((
        children: readonly (Tree | TreeBuffer)[],
        positions: readonly number[],
        length: number
      ) => Tree)
    | null,
  // Function to build internal nodes for the balanced tree
  mkTree: (
    children: readonly (Tree | TreeBuffer)[],
    positions: readonly number[],
    length: number
  ) => Tree
): Tree {
  let total = 0;
  for (let i = from; i < to; i++) total += nodeSize(balanceType, children[i]!);

  let maxChild = Math.ceil((total * 1.5) / Balance.BranchFactor);
  let localChildren: (Tree | TreeBuffer)[] = [],
    localPositions: number[] = [];
  function divide(
    children: readonly (Tree | TreeBuffer)[],
    positions: readonly number[],
    from: number,
    to: number,
    offset: number
  ) {
    for (let i = from; i < to; ) {
      let groupFrom = i,
        groupStart = positions[i]!,
        groupSize = nodeSize(balanceType, children[i]!);
      i++;
      for (; i < to; i++) {
        let nextSize = nodeSize(balanceType, children[i]!);
        if (groupSize + nextSize >= maxChild) break;
        groupSize += nextSize;
      }
      if (i == groupFrom + 1) {
        if (groupSize > maxChild) {
          let only = children[groupFrom] as Tree; // Only trees can have a size > 1
          divide(
            only.children,
            only.positions,
            0,
            only.children.length,
            positions[groupFrom]! + offset
          );
          continue;
        }
        localChildren.push(children[groupFrom]!);
      } else {
        let length = positions[i - 1]! + children[i - 1]!.length - groupStart;
        localChildren.push(
          balanceRange(
            balanceType,
            children,
            positions,
            groupFrom,
            i,
            groupStart,
            length,
            null,
            mkTree
          )
        );
      }
      localPositions.push(groupStart + offset - start);
    }
  }
  divide(children, positions, from, to, 0);
  return (mkTop || mkTree)(localChildren, localPositions, length);
}

/// Provides a way to associate values with pieces of trees. As long
/// as that part of the tree is reused, the associated values can be
/// retrieved from an updated tree.
export class NodeWeakMap<T> {
  private map = new WeakMap<Tree | TreeBuffer, T | Map<number, T>>();

  private setBuffer(buffer: TreeBuffer, index: number, value: T) {
    let inner = this.map.get(buffer) as Map<number, T> | undefined;
    if (!inner) this.map.set(buffer, (inner = new Map()));
    inner.set(index, value);
  }

  private getBuffer(buffer: TreeBuffer, index: number): T | undefined {
    let inner = this.map.get(buffer) as Map<number, T> | undefined;
    return inner && inner.get(index);
  }

  /// Set the value for this syntax node.
  set(node: SyntaxNode, value: T) {
    if (node instanceof BufferNode)
      this.setBuffer(node.context.buffer, node.index, value);
    else if (node instanceof TreeNode) this.map.set(node.tree, value);
  }

  /// Retrieve value for this syntax node, if it exists in the map.
  get(node: SyntaxNode): T | undefined {
    return node instanceof BufferNode
      ? this.getBuffer(node.context.buffer, node.index)
      : node instanceof TreeNode
      ? (this.map.get(node.tree) as T | undefined)
      : undefined;
  }

  /// Set the value for the node that a cursor currently points to.
  cursorSet(cursor: TreeCursor, value: T) {
    if (cursor.buffer)
      this.setBuffer(cursor.buffer.buffer, cursor.index, value);
    else this.map.set(cursor.tree!, value);
  }

  /// Retrieve the value for the node that a cursor currently points
  /// to.
  cursorGet(cursor: TreeCursor): T | undefined {
    return cursor.buffer
      ? this.getBuffer(cursor.buffer.buffer, cursor.index)
      : (this.map.get(cursor.tree!) as T | undefined);
  }
}
