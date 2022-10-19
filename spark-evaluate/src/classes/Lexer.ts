/*!
 * simple-evaluate <https://github.com/shepherdwind/simple-evaluate>
 *
 * Copyright (c) 2017 sheperdwind <eward.song@gmail.com>
 * Released under the MIT License.
 */

import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerToken } from "../types/compilerToken";
import { OperationType } from "../types/operationType";

export class Lexer {
  // current postion
  private currentIndex = 0;

  // result token list
  private tokenList: CompilerToken[] = [];

  // result diagnostics
  private diagnostics: CompilerDiagnostic[] = [];

  // input string
  private input = "";

  // operation table
  private optable: {
    [key: string]: OperationType;
  } = {
    "=": "LOGIC",
    "&": "LOGIC",
    "|": "LOGIC",
    "?": "LOGIC",
    ":": "LOGIC",

    "'": "STRING",
    '"': "STRING",
    "`": "STRING",

    "!": "COMPARISON",
    ">": "COMPARISON",
    "<": "COMPARISON",

    "(": "MATH",
    ")": "MATH",
    "+": "MATH",
    "-": "MATH",
    "*": "MATH",
    "/": "MATH",
    "%": "MATH",
  };

  constructor(expression: string) {
    this.input = expression;
  }

  getTokens(): [CompilerToken[], CompilerDiagnostic[]] {
    let tok: string;
    do {
      // read current token, so step should be -1
      tok = this.pickNext(-1);
      const pos = this.currentIndex;
      switch (this.optable[tok]) {
        case "LOGIC":
          // == && || ===
          this.readLogicOpt(tok);
          break;

        case "STRING":
          this.readString(tok);
          break;

        case "COMPARISON":
          this.readCompare(tok);
          break;

        case "MATH":
          this.receiveToken();
          break;

        default:
          this.readValue(tok);
      }

      // if the pos not changed, this loop will go into a infinite loop, every step of while loop,
      // we must move the pos forward
      // so here we should log error, for example `1 & 2`
      if (pos === this.currentIndex && tok !== undefined) {
        this.diagnostics.push({
          content: "",
          from: 0,
          to: tok.length,
          severity: "error",
          type: "unknown-token",
          message: `unknown token ${tok} from input string ${this.input}`,
        });
        break;
      }
    } while (tok !== undefined);

    return [this.tokenList, this.diagnostics];
  }

  /**
   * read next token, the index param can set next step, default go foward 1 step
   *
   * @param index next postion
   */
  private pickNext(index = 0): string {
    return this.input[index + this.currentIndex + 1] || "";
  }

  /**
   * Store token into result tokenList, and move the pos index
   *
   * @param index
   */
  private receiveToken(index = 1): void {
    const from = this.currentIndex;
    const to = this.currentIndex + index;
    const text = this.input.slice(from, to);
    const trimmedStart = text.trimStart();
    const trimmedEnd = text.trimEnd();
    const offsetStart = text.length - trimmedStart.length;
    const offsetEnd = text.length - trimmedEnd.length;
    const content = text.trim();
    // skip empty string
    if (content) {
      this.tokenList.push({
        type: "token",
        content,
        from: from + offsetStart,
        to: to - offsetEnd,
      });
    }

    this.currentIndex += index;
  }

  // ' or "
  private readString(tok: string): void {
    let next;
    let index = 0;
    do {
      next = this.pickNext(index);
      index += 1;
    } while (next !== tok && next !== undefined);
    this.receiveToken(index + 1);
  }

  // > or < or >= or <= or !==
  // tok in (>, <, !)
  private readCompare(tok: string): void {
    if (this.pickNext() !== "=") {
      this.receiveToken(1);
      return;
    }
    // !==
    if (tok === "!" && this.pickNext(1) === "=") {
      this.receiveToken(3);
      return;
    }
    this.receiveToken(2);
  }

  // === or ==
  // && ||
  private readLogicOpt(tok: string): void {
    if (this.pickNext() === tok) {
      // ===
      if (tok === "=" && this.pickNext(1) === tok) {
        this.receiveToken(3);
        return;
      }
      // == && ||
      this.receiveToken(2);
      return;
    }
    // handle as &&
    // a ? b : c is equal to a && b || c
    if (tok === "?" || tok === ":") {
      this.receiveToken(1);
    }
  }

  private readValue(tok: string): void {
    if (!tok) {
      return;
    }

    let index = 0;
    while (!this.optable[tok] && tok !== undefined) {
      tok = this.pickNext(index);
      index += 1;
    }
    this.receiveToken(index);
  }
}
