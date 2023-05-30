import {
  createSparkToken,
  SparkLine,
  SparkToken,
  SparkTokenTypeMap,
} from "../../../sparkdown";
import { PrintProfile } from "../types/PrintProfile";

export interface LineItem extends SparkLine {
  position?: "left" | "right";
  scene?: string | number;
  level?: number;

  token?: LineItem;
  lines?: LineItem[];

  hide?: boolean;
  localIndex?: number;
  globalIndex?: number;
  leftColumn?: LineItem[];
  rightColumn?: LineItem[];
  sceneSplit?: boolean;
}

export interface LinerConfig {
  screenplay_print_dialogue_contd?: string;
  screenplay_print_dialogue_more?: string;
  screenplay_print_dialogue_split_across_pages?: boolean;
}

export const createLine = (token: Partial<LineItem>): LineItem => {
  const line = {
    ...token,
    type: token.type || "unknown",
    content: token.content || "",
    text: token.text || "",
    from: token.from || 0,
    to: token.to || 0,
    line: token.line || 0,
    duration: token.duration || 0,
    offset: token.offset || 0,
    indent: token.indent || 0,
    order: token.order || 0,
    token:
      token.token ||
      (createSparkToken(token.type as keyof SparkTokenTypeMap) as LineItem),
  };
  line.token.lines = line.token.lines || [line];
  return line;
};

export const createSeparator = (from: number, to: number): SparkToken => {
  return createSparkToken("separator", undefined, { from, to, text: "" });
};

export class Liner {
  _state = "normal"; // 'dialogue'

  splitText = (
    text: string,
    max: number,
    index: number,
    token: LineItem
  ): LineItem[] => {
    if (text.length <= max) {
      return [
        createLine({
          type: token.type,
          text: text,
          from: index,
          to: index + text.length - 1,
          token: token,
        }),
      ];
    }
    let pointer = text.substr(0, max + 1).lastIndexOf(" ");

    if (pointer === -1) {
      pointer = max - 1;
    }

    return [
      createLine({
        type: token.type,
        text: text.substring(0, pointer),
        from: index,
        to: index + pointer,
        token: token,
      }),
    ].concat(
      this.splitText(text.substring(pointer + 1), max, index + pointer, token)
    );
  };

  splitToken = (token: LineItem, max: number): void => {
    token.lines = this.splitText(token.text || "", max, token.from, token);
  };

  breaker = (
    index: number,
    lines: LineItem[],
    config: LinerConfig
  ): boolean => {
    const CONTD = config.screenplay_print_dialogue_contd || "(CONT'D)";
    const MORE = config.screenplay_print_dialogue_more || "(MORE)";
    const splitAcrossPages =
      config.screenplay_print_dialogue_split_across_pages;

    let before = index - 1;
    while (before && !lines[before]?.text) {
      before--;
    }

    let after = index + 1;
    while (after < lines.length && !lines[after]?.text) {
      after++;
    }

    // possible break is after this token
    const tokenOnBreak = lines[index];
    if (!tokenOnBreak) {
      return false;
    }

    const tokenAfter = lines[after];
    const tokenBefore = lines[before];

    if (
      tokenOnBreak.type === "scene" &&
      tokenAfter &&
      tokenAfter.type !== "scene"
    ) {
      return false;
    } else if (
      tokenAfter &&
      tokenAfter.type === "transition" &&
      tokenOnBreak.type !== "transition"
    ) {
      return false;
    }
    // action block 1,2 or 3 lines.
    // don't break unless it's the last line
    else if (
      tokenOnBreak.type === "action" &&
      tokenOnBreak.token &&
      tokenOnBreak.token.lines &&
      tokenOnBreak.token.lines.length < 4 &&
      tokenOnBreak.token.lines.indexOf(tokenOnBreak) !==
        tokenOnBreak.token.lines.length - 1
    ) {
      return false;
    }
    // for and more lines
    // break on any line different than first and penultimate
    // ex.
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    else if (
      tokenOnBreak.type === "action" &&
      tokenOnBreak.token &&
      tokenOnBreak.token.lines &&
      tokenOnBreak.token.lines.length >= 4 &&
      (tokenOnBreak.token.lines.indexOf(tokenOnBreak) === 0 ||
        tokenOnBreak.token.lines.indexOf(tokenOnBreak) ===
          tokenOnBreak.token.lines.length - 2)
    ) {
      return false;
    } else if (
      splitAcrossPages &&
      tokenOnBreak.type === "dialogue" &&
      tokenAfter &&
      tokenAfter.type === "dialogue" &&
      tokenBefore?.type === "dialogue" &&
      !tokenOnBreak.position
    ) {
      let newPageCharacter;
      let character = before;
      while (
        lines[character] &&
        lines[character]?.type !== "dialogue_character"
      ) {
        character--;
      }
      let characterName = "";
      if (lines[character]) {
        characterName = lines[character]?.text || "";
      }

      const moreItem: LineItem = {
        type: "more",
        text: MORE,
        content: MORE,
        from: tokenOnBreak.from,
        to: tokenOnBreak.to,
        token: tokenOnBreak.token,
        line: tokenOnBreak.line,
        duration: tokenOnBreak.duration,
        offset: 0,
        indent: 0,
        order: 0,
      };
      const contdText =
        characterName.trim() +
        " " +
        (characterName.indexOf(CONTD) !== -1 ? "" : CONTD);
      lines.splice(
        index,
        0,
        createLine(moreItem),
        (newPageCharacter = createLine({
          type: "dialogue_character",
          text: contdText,
          content: contdText,
          from: tokenAfter.from,
          to: tokenAfter.to,
          token: tokenOnBreak.token,
        }))
      );

      if (lines[character] && lines[character]?.rightColumn) {
        const dialogueOnPageLength = index - character;
        const rightLinesOnThisPage = (lines[character]?.rightColumn || [])
          .slice(0, dialogueOnPageLength)
          .concat([
            createLine({
              type: "more",
              text: MORE,
              content: MORE,
              from: tokenOnBreak.from,
              to: tokenOnBreak.to,
              token: tokenOnBreak.token,
            }),
          ]);
        const rightText =
          rightLinesOnThisPage[0]?.text.trim() +
          " " +
          (rightLinesOnThisPage[0]?.text.indexOf(CONTD) !== -1 ? "" : CONTD);
        const rightLinesForNextPage = [
          createLine({
            type: "dialogue_character",
            text: rightText,
            content: rightText,
            from: tokenAfter.from,
            to: tokenAfter.to,
            token: tokenOnBreak.token,
          }),
        ].concat(
          (lines[character]?.rightColumn || []).slice(dialogueOnPageLength)
        );

        const characterLine = lines[character];
        if (characterLine) {
          characterLine.rightColumn = rightLinesOnThisPage;
        }
        if (rightLinesForNextPage.length > 1) {
          newPageCharacter.rightColumn = rightLinesForNextPage;
        }
      }

      return true;
    } else if (
      ["dialogue_character", "dialogue_parenthetical", "dialogue"].includes(
        lines[index]?.type || ""
      ) &&
      lines[after] &&
      ["dialogue_parenthetical", "dialogue"].includes(lines[after]?.type || "")
    ) {
      return false; // or break
    }
    return true;
  };

  breakLines = (
    lines: LineItem[],
    breaker: (index: number, lines: LineItem[], config: LinerConfig) => boolean,
    print: PrintProfile,
    config: LinerConfig
  ): LineItem[] => {
    while (lines.length && !lines[0]?.text) {
      lines.shift();
    }

    const max = print.lines_per_page;

    let s = max;
    let p;
    let internalBreak = 0;

    for (let i = 0; i < lines.length && i < max; i++) {
      if (lines[i]?.type === "page_break") {
        internalBreak = i;
      }
    }

    if (!internalBreak) {
      if (lines.length <= max) {
        return lines;
      }
      do {
        for (p = s - 1; p && !lines[p]?.text; p--) {
          // loop
        }
        s = p;
      } while (p && !breaker(p, lines, config));
      if (!p) {
        p = max;
      }
    } else {
      p = internalBreak - 1;
    }
    const page = lines.slice(0, p + 1);

    // if scene is not finished (next not empty token is not a heading) - add (CONTINUED)
    let nextPageLineIndex = p + 1;
    let nextPageLine = null;
    let sceneSplit = false;
    while (nextPageLineIndex < lines.length && nextPageLine === null) {
      const line = lines[nextPageLineIndex];
      if (line?.type !== "separator" && line?.type !== "page_break") {
        nextPageLine = line;
      }
      nextPageLineIndex++;
    }

    if (nextPageLine && nextPageLine.type !== "scene") {
      sceneSplit = true;
    }

    page.push(
      createLine({
        type: "page_break",
        sceneSplit: sceneSplit,
      })
    );
    const append = this.breakLines(lines.slice(p + 1), breaker, print, config);
    return page.concat(append);
  };

  foldDualDialogue = (lines: LineItem[]) => {
    let anyUnfoldedDualDialogueExists = true;

    const getFirstUnfoldedDualLeft = () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line) {
          if (
            line.token &&
            line.token?.type === "dialogue_character" &&
            line.token?.position === "left" &&
            line.rightColumn === undefined
          ) {
            return i;
          }
        }
      }
      return -1;
    };
    const getFirstUnfoldedDualRightIndexFrom = (index: number) => {
      for (let i = index; i < lines.length; i++) {
        const line = lines[i];
        if (line) {
          if (
            line.token &&
            line.token?.type === "dialogue_character" &&
            line.token?.position === "right"
          ) {
            return i;
          }
        }
      }
      return -1;
    };
    const countDialogueTokens = (i: number) => {
      let result = 0;
      let canbeCharacter = true;
      while (
        lines[i] &&
        (lines[i]?.type === "dialogue_parenthetical" ||
          lines[i]?.type === "dialogue" ||
          (canbeCharacter && lines[i]?.type === "dialogue_character"))
      ) {
        if (lines[i]?.type !== "dialogue_character") {
          canbeCharacter = false;
        }
        result++;
        i++;
      }
      return result;
    };
    const foldDualDialogue = (leftIndex: number, rightIndex: number) => {
      const dialogueTokens = countDialogueTokens(rightIndex);
      const leftTokens = countDialogueTokens(leftIndex);
      const rightLines = lines.splice(rightIndex, dialogueTokens);
      const leftLine = lines[leftIndex];
      if (leftLine) {
        leftLine.rightColumn = rightLines;
      }

      if (dialogueTokens > leftTokens) {
        //There's more dialogue lines on the right than on the left:
        //Insert dummy lines onto the left so it's the same length as the right.
        let insertLength = dialogueTokens - leftTokens;
        const insertArray: LineItem[] = [];
        while (insertLength > 0) {
          insertArray.push(
            createLine({
              type: lines[leftIndex + leftTokens]?.type,
              text: "",
              content: "",
              from: lines[leftIndex + leftTokens]?.from,
              to: lines[leftIndex + leftTokens]?.to,
              token: lines[leftIndex + leftTokens]?.token,
            })
          );
          insertLength--;
        }
        lines.splice(leftIndex + leftTokens, 0, ...insertArray);
      }
    };

    while (anyUnfoldedDualDialogueExists) {
      const leftIndex = getFirstUnfoldedDualLeft();
      const rightIndex =
        leftIndex === -1 ? -1 : getFirstUnfoldedDualRightIndexFrom(leftIndex);
      anyUnfoldedDualDialogueExists = leftIndex !== -1 && rightIndex !== -1;
      if (anyUnfoldedDualDialogueExists) {
        foldDualDialogue(leftIndex, rightIndex);
      }
    }
  };

  line = (
    tokens: LineItem[],
    print: PrintProfile,
    config: LinerConfig
  ): LineItem[] => {
    let lines: LineItem[] = [];
    let globalIndex = 0;

    this._state = "normal";

    tokens.forEach((token: LineItem) => {
      if (!token.hide) {
        let max =
          ((print[token.type as keyof PrintProfile] as { max: number }) || {})
            .max || print.action.max;

        //Replace tabs with 4 spaces
        if (token.text) {
          token.text = token.text.replace("\t", "    ");
        }

        if (token.position) {
          max *= print.dual_max_factor;
        }

        this.splitToken(token, max);

        if (token.lines) {
          if (token.type === "scene" && lines.length) {
            const firstLine = token.lines[0];
            if (firstLine) {
              firstLine.scene = token.scene;
            }
          }

          token.lines.forEach((line: LineItem, index: number) => {
            line.localIndex = index;
            line.globalIndex = globalIndex++;
            lines.push(line);
          });
        }
      }
    });

    this.foldDualDialogue(lines);
    lines = this.breakLines(lines, this.breaker, print, config);

    return lines;
  };
}