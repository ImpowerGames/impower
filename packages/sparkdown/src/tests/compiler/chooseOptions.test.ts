import type { SyntaxNode } from "@lezer/common";
import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { chooseOptions } from "../../compiler/utils/chooseOptions";
import { run } from "../program/programScopes";

const URI = "file:///options.sd";

const scriptOf = (body: string[]) =>
  ["scene start", ...body, "end", ""].join("\n");

const gathered = (text: string): string[] => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  let block: SyntaxNode | undefined;
  documents.tree(URI)!.iterate({
    enter: (node) => {
      if (!block && node.name === "LuauSparkdownChooseBlock") {
        block = node.node;
      }
      return !block;
    },
  });
  return chooseOptions(block!).map((choice) => {
    const content = choice.getChild("Choice_content")!;
    return text.slice(content.from, content.to).trim();
  });
};

const offered = (text: string): string[] => run(text).menus[0] ?? [];

const EVERY_OPTION_OFFERED: [string, string[], string[]][] = [
  ["direct options", ["  choose", "    * A", "    * B", "  end"], ["A", "B"]],
  [
    "options inside an if block before the first direct option",
    ["  choose", "    if true then", "      * A", "      * B", "    end", "  end"],
    ["A", "B"],
  ],
  [
    "options inside an if block, then a direct option",
    ["  choose", "    if true then", "      * A", "    end", "    * B", "  end"],
    ["A", "B"],
  ],
  [
    "an option inside a do block",
    ["  choose", "    do", "      * A", "    end", "    * B", "  end"],
    ["A", "B"],
  ],
  [
    "an option inside a while loop",
    [
      "  local n = 0",
      "  choose",
      "    while n < 1 do",
      "      n = n + 1",
      "      * A",
      "    end",
      "    * B",
      "  end",
    ],
    ["A", "B"],
  ],
  [
    "an option inside a for loop",
    ["  choose", "    for i = 1, 1 do", "      * A", "    end", "    * B", "  end"],
    ["A", "B"],
  ],
  [
    "an option inside a repeat loop",
    ["  choose", "    repeat", "      * A", "    until true", "    * B", "  end"],
    ["A", "B"],
  ],
  [
    "an option in an alternator's arm",
    ["  choose", "    cycle", "      | * A", "    end", "    * B", "  end"],
    ["A", "B"],
  ],
  [
    "a choose block written before the first option",
    [
      "  choose",
      "    choose",
      "      * Inner",
      "        Took inner.",
      "    then",
      "      Inner then.",
      "    end",
      "    * Outer",
      "  end",
    ],
    ["Inner", "Outer"],
  ],
  [
    "a choose block before the first option of an if block",
    [
      "  choose",
      "    if true then",
      "      choose",
      "        * Z",
      "      end",
      "      * A",
      "    end",
      "    * B",
      "  end",
    ],
    ["Z", "A", "B"],
  ],
  [
    "a choose block in an option's body",
    [
      "  choose",
      "    * Inner",
      "      choose",
      "        * Deep",
      "      end",
      "    * Outer",
      "  end",
    ],
    ["Inner", "Outer"],
  ],
  [
    "a choose block after an option of an if block",
    [
      "  choose",
      "    if true then",
      "      * A",
      "      choose",
      "        * Z",
      "      end",
      "    end",
      "    * B",
      "  end",
    ],
    ["A", "B"],
  ],
  [
    "a do block after an option of an if block",
    [
      "  choose",
      "    if true then",
      "      * A",
      "      do",
      "        * N",
      "      end",
      "    end",
      "    * B",
      "  end",
    ],
    ["A", "N", "B"],
  ],
  [
    "an option inside a function definition",
    ["  choose", "    local function f()", "      * A", "    end", "    * B", "  end"],
    ["B"],
  ],
  [
    "an option inside a function expression",
    ["  choose", "    local f = function()", "      * A", "    end", "    * B", "  end"],
    ["B"],
  ],
  [
    "an option in the then clause",
    [
      "  choose",
      "    * A",
      "  then",
      "    choose",
      "      * Z",
      "    end",
      "  end",
    ],
    ["A"],
  ],
];

describe("the options a choose block offers, read from its syntax", () => {
  it.each(EVERY_OPTION_OFFERED)(
    "%s: the gatherer lists the menu the game offers",
    (_case, body, expected) => {
      const text = scriptOf(body);
      expect(offered(text)).toEqual(expected);
      expect(gathered(text)).toEqual(expected);
    },
  );

  it("lists every branch's options of an if block, and the game offers those of the branch it takes", () => {
    const body = (first: boolean, second: boolean) => [
      "  choose",
      `    if ${first} then`,
      "      * A",
      `    elseif ${second} then`,
      "      * E",
      "    else",
      "      * C",
      "    end",
      "    * B",
      "  end",
    ];
    expect(gathered(scriptOf(body(true, true)))).toEqual(["A", "E", "C", "B"]);
    expect(offered(scriptOf(body(true, true)))).toEqual(["A", "B"]);
    expect(offered(scriptOf(body(false, true)))).toEqual(["E", "B"]);
    expect(offered(scriptOf(body(false, false)))).toEqual(["C", "B"]);
  });

  const LATER_ARM_WRAPPERS: [string, string[], string][] = [
    ["no block", [], ""],
    ["a do block", ["do"], "end"],
    ["an if block", ["if true then"], "end"],
    ["a for loop", ["for i = 1, 1 do"], "end"],
    ["a repeat loop", ["repeat"], "until true"],
  ];

  it.each(LATER_ARM_WRAPPERS)(
    "a choose block in %s in an alternator's arm after an arm holding an option is the menu's, and the game offers the taken arm's",
    (_wrapper, open, close) => {
      const body = (selector: string) => [
        "  choose",
        `    match "${selector}"`,
        "      | a = * A",
        "      | b =",
        ...open.map((line) => `        ${line}`),
        "          choose",
        "            * Z",
        "              Took Z.",
        "          end",
        ...(close ? [`        ${close}`] : []),
        "    end",
        "    * Outer",
        "  end",
      ];
      expect(gathered(scriptOf(body("b")))).toEqual(["A", "Z", "Outer"]);
      expect(offered(scriptOf(body("a")))).toEqual(["A", "Outer"]);
      expect(offered(scriptOf(body("b")))).toEqual(["Z", "Outer"]);
    },
  );

  it("lists a cycle's later arm's choose block after an arm holding an option, and the game offers the first arm's on its first pass", () => {
    const text = scriptOf([
      "  choose",
      "    cycle",
      "      | * A",
      "      |",
      "        choose",
      "          * Z",
      "        end",
      "    end",
      "    * Outer",
      "  end",
    ]);
    expect(gathered(text)).toEqual(["A", "Z", "Outer"]);
    expect(offered(text)).toEqual(["A", "Outer"]);
  });});
