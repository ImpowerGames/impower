/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { IPosition } from "./rules/token/string";

export interface INode {
  type: string;
  name?: string;
  raw?: string;
  prefix?: string;
  operator?: string;
  content?: string;
  property?: INode;
  alternate?: INode;
  consequent?: INode;
  test?: INode;
  computed?: boolean;
  shortCircuited?: boolean;
  optional?: boolean;
  from?: number;
  to?: number;
  escapes?: IPosition[];
  value?: any;
  expression?: INode;
  expressions?: INode[];
  left?: INode;
  right?: INode;
  argument?: INode;
  key?: INode;
  callee?: INode;
  object?: INode;
  tag?: INode;
  params?: INode | INode[];
  elements?: INode[];
  arguments?: INode[];
  body?: INode[];
  properties?: INode[];
  quasi?: INode;
  quasis?: INode[];
  [prop: string]: any;
}

export interface ICharClass {
  re: RegExp;
  re2?: RegExp;
}

export interface IOperatorDef {
  [operator: string]: { space?: boolean };
}

export interface IParserConfig {
  identStart: ICharClass;
  identPart: ICharClass;

  maxOpLen: number;
  ops: { [op: string]: boolean };
}
