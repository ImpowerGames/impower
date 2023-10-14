/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SpecialRecord } from "../../compiler/enums/SpecialRecord";
import { Node } from "../../core";

import { RuleDefinition } from "../types/GrammarDefinition";
import { createID } from "../utils/createID";

export default class GrammarNode implements Node {
  /** The type of node represented as a unique number. */
  declare typeIndex: number;

  /** The type of node represented as a unique string. */
  declare typeId: string;

  /** Props associated with this node. */
  declare props: Record<string, any>;

  /** @param id - The ID to assign to this node. */
  constructor(
    typeIndex: number,
    def: RuleDefinition,
    declarator?: (
      typeIndex: number,
      typeId: string,
      data: RuleDefinition
    ) => Record<string, any>
  ) {
    let { id, ...definitionProps } = def;

    this.typeIndex = typeIndex;
    this.typeId = id || createID();

    const otherProps = declarator?.(this.typeIndex, this.typeId, def);
    this.props = { ...definitionProps, ...otherProps };
  }

  /** Special `Node` used for when a rule doesn't emit anything. */
  static None = new GrammarNode(SpecialRecord.Reuse, { id: "none" });
}
