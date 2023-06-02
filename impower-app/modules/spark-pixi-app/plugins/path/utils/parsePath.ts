/*!
 * Based on path-data-parser <https://github.com/pshihn/path-data-parser>
 *
 * Copyright (c) 2020 Preet Shihn
 * Released under the MIT license.
 */

import { PathCommand, PathToken } from "../types/Path";

const COMMAND = 0;
const NUMBER = 1;
const EOD = 2;

const PARAMS: { [key: string]: number } = {
  A: 7,
  a: 7,
  C: 6,
  c: 6,
  H: 1,
  h: 1,
  L: 2,
  l: 2,
  M: 2,
  m: 2,
  Q: 4,
  q: 4,
  S: 4,
  s: 4,
  T: 2,
  t: 2,
  V: 1,
  v: 1,
  Z: 0,
  z: 0,
};

const tokenize = (d: string): PathToken[] => {
  const tokens: PathToken[] = [];
  while (d !== "") {
    if (d.match(/^([ \t\r\n,]+)/)) {
      d = d.substring(RegExp.$1.length);
    } else if (d.match(/^([aAcChHlLmMqQsStTvVzZ])/)) {
      tokens[tokens.length] = { type: COMMAND, text: RegExp.$1 };
      d = d.substring(RegExp.$1.length);
    } else if (
      d.match(/^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/)
    ) {
      tokens[tokens.length] = {
        type: NUMBER,
        text: `${parseFloat(RegExp.$1)}`,
      };
      d = d.substring(RegExp.$1.length);
    } else {
      return [];
    }
  }
  tokens[tokens.length] = { type: EOD, text: "" };
  return tokens;
};

const isType = (token: PathToken, type: number): boolean => {
  return token.type === type;
};

/**
 * Parse path string to segment array
 */
export const parsePath = (d: string): PathCommand[] => {
  const segments: PathCommand[] = [];
  const tokens = tokenize(d);
  let command = "BOD";
  let index = 0;
  let token = tokens[index];
  while (!isType(token, EOD)) {
    let paramsCount = 0;
    const params: number[] = [];
    if (command === "BOD") {
      if (token.text === "M" || token.text === "m") {
        index += 1;
        paramsCount = PARAMS[token.text];
        command = token.text;
      } else {
        return parsePath(`M0,0${d}`);
      }
    } else if (isType(token, NUMBER)) {
      paramsCount = PARAMS[command];
    } else {
      index += 1;
      paramsCount = PARAMS[token.text];
      command = token.text;
    }
    if (index + paramsCount < tokens.length) {
      for (let i = index; i < index + paramsCount; i += 1) {
        const numbeToken = tokens[i];
        if (isType(numbeToken, NUMBER)) {
          params[params.length] = +numbeToken.text;
        } else {
          throw new Error(`Param not a number: ${command},${numbeToken.text}`);
        }
      }
      if (typeof PARAMS[command] === "number") {
        const segment: PathCommand = { command, data: params };
        segments.push(segment);
        index += paramsCount;
        token = tokens[index];
        if (command === "M") {
          command = "L";
        }
        if (command === "m") {
          command = "l";
        }
      } else {
        throw new Error(`Bad segment: ${command}`);
      }
    } else {
      throw new Error("Path data ended short");
    }
  }
  return segments;
};
