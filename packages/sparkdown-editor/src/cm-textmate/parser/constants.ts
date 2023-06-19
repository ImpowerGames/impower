/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeProp, NodeType } from "@lezer/common";
import { NodeID } from "../core/id";
import type { ParserNode } from "../grammar/node";

/**
 * Sets the initial array size for chunks, and how much to grow a chunk's
 * array if it's full.
 */
export const CHUNK_ARRAY_INTERVAL = 16;

/** Sets the size of the compiler stack. */
export const COMPILER_STACK_SIZE = 64;

/**
 * Sets the initial array size of the compiler's buffer, and how much to
 * grow it if it's full.
 */
export const COMPILER_ARRAY_INTERVAL = 32768;

/**
 * If true, the parser will try to close off incomplete nodes at the end of
 * the syntax tree.
 */
export const FINISH_INCOMPLETE_NODES = true;

/** If true, nested grammars won't be emitted. */
export const DISABLED_NESTED = false;

/** If true, the "left" (previous) side of a parse will be reused. */
export const REUSE_LEFT = true;

/** If true, the "right" (ahead) side of a parse will be reused. */
export const REUSE_RIGHT = true;

/** Amount of characters to slice before the starting position of the parse. */
export const MARGIN_BEFORE = 32;

/** Amount of characters to slice after the requested ending position of a parse. */
export const MARGIN_AFTER = 128;

// disabled as it doesn't seem to be needed for performance
/** If true, the parser will try to limit what it handles to the size of the viewport. */
export const LIMIT_TO_VIEWPORT = false;

// node types

/**
 * Node emitted when the parser reached a newline and had to manually advance.
 */
export const NODE_NEWLINE = NodeType.define({
  name: "newline",
  id: NodeID.NEWLINE,
});

/**
 * Node emitted when the parser didn't match anything in the grammar,
 * and had to manually advance.
 */
export const NODE_ERROR_UNRECOGNIZED = NodeType.define({
  name: "⚠️ ERROR_UNRECOGNIZED",
  id: NodeID.ERROR_UNRECOGNIZED,
  error: true,
});

/** Node emitted at the end of incomplete nodes. */
export const NODE_ERROR_INCOMPLETE = NodeType.define({
  name: "⚠️ ERROR_INCOMPLETE",
  id: NodeID.ERROR_INCOMPLETE,
  error: true,
});

/**
 * A special per-node `NodeProp` used for describing nodes where a nested
 * parser will be embedded.
 */
export const embeddedParserProp = new NodeProp<string>();

/** A `NodeProp` that points to the original grammar `Node` for the `NodeType`. */
export const nodeTypeProp = new NodeProp<ParserNode>();
