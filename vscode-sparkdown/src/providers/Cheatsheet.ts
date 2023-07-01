import * as vscode from "vscode";

export class SparkdownCheatSheetWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      localResourceRoots: [this._extensionUri],
    };

    const styleUriString = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "out",
          "webviews",
          "cheatsheet.css"
        )
      )
      .toString();
    const codiconUriString = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, "out", "data", "codicon.css")
      )
      .toString();

    const fontUri = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "out",
          "data",
          "courier-prime.ttf"
        )
      )
      .toString();
    const fontUriBold = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "out",
          "data",
          "courier-prime-bold.ttf"
        )
      )
      .toString();
    const fontUriItalic = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "out",
          "data",
          "courier-prime-italic.ttf"
        )
      )
      .toString();
    const fontUriBoldItalic = webviewView.webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "out",
          "data",
          "courier-prime-bold-italic.ttf"
        )
      )
      .toString();

    const cspSource = webviewView.webview.cspSource;

    webviewView.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="
              default-src 'none';
              style-src ${cspSource} 'unsafe-inline';
              img-src ${cspSource} https: http: data:;
              font-src ${cspSource} https:;
            ">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
           
            <title>Cheat Sheet</title>
            <link rel="stylesheet" href="${styleUriString}">
            <link rel="stylesheet" type="text/css" href="${codiconUriString}">
            <style>
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUri});
                font-weight: normal;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriBold});
                font-weight: bold;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriItalic});
                font-weight: normal;
                font-style: italic;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriBoldItalic});
                font-weight: bold;
                font-style: italic;
            }
            </style>
        </head>
        <body>
            ${getCheatSheetAsHtml()}
            <div class='load'>.</div>
        </body>
        </html>`;
  }
}

class CheatsheetItem {
  label: string;
  highlights?: [number, number][];
  constructor(
    public symbol: string,
    public description: string,
    public example: string,
    public info?: string
  ) {
    this.label = `${symbol} ${description}`.trim();
    this.highlights = [[0, symbol.length]];
  }
}

const getCheatSheetAsHtml = () => {
  let result = "";
  Object.entries(getCheatSheet()).forEach(([categoryName, cheatsheetItems]) => {
    result += `<details class="category"><summary><span class="">${categoryName}</span></summary><div>`;
    cheatsheetItems.forEach((item) => {
      result += `<details class="cheat-item">
  <summary>
    <span><mark class="symbol">${
      item.symbol
    }</mark> <mark class="description">${item.description}</mark>${
        item.info ? `<span class="info">\n${item.info}</span>` : ""
      }</span>
  </summary>
  <p><span class="example">${item.example}</span></p>
</details>`;
    });
    result += "</div></details>";
  });
  return result;
};

const getCheatSheet = (): Record<string, CheatsheetItem[]> => {
  const cheatSheet: Record<string, CheatsheetItem[]> = {};
  cheatSheet["Scenes"] = [
    new CheatsheetItem(
      "INT.",
      "An indoor scene",
      "<span class='scene'>INT. BRICK'S ROOM - DAY</span>"
    ),
    new CheatsheetItem(
      "EXT.",
      "An outdoor scene",
      "<span class='scene'>EXT. BRICK'S POOL - DAY</span>"
    ),
    new CheatsheetItem(
      "INT./EXT.",
      "A scene that is intercut between indoors and outdoors",
      "<span class='scene'>INT./EXT. RONNA'S CAR</span>"
    ),
    new CheatsheetItem(
      "CUT TO:",
      "Transitions are uppercase and end with ' TO:'",
      "<span class='transition'>SMASH CUT TO:</span><span class='scene'>\nEXT. WOODEN SHACK - DAY</span>"
    ),
    new CheatsheetItem(
      "!",
      "Action (aka scene description) is any paragraph that doesn't meet criteria for another element",
      "The men look at each other."
    ),
  ];

  cheatSheet["Dialogue"] = [
    new CheatsheetItem(
      "@",
      "Character names are always UPPERCASE",
      "<span class='dialogue_character'>STEEL</span><span class='dialogue'>The man's a myth!</span>"
    ),
    new CheatsheetItem(
      "()",
      "Parentheticals follow a Character or Dialogue element, and are wrapped in parentheses ()",
      "<span class='dialogue_character'>STEEL</span><span class='dialogue_parenthetical'>(starting the engine)</span><span class='dialogue'>So much for retirement!</span>"
    ),
    new CheatsheetItem(
      "…",
      "Dialogue is any text following a Character or Parenthetical element",
      "<span class='dialogue_character'>SANBORN</span><span class='dialogue'>A good 'ole boy.</span>"
    ),
    new CheatsheetItem(
      "^",
      "Dual (aka simultaneous) dialogue is expressed by adding a caret ^ after the second Character element",
      "<span class='dialogue_character'>BRICK</span><span class='dialogue'>Screw retirement.</span><span class='dialogue_character'>\nSTEEL <mark class='caret'>^</mark></span><span class='dialogue'>Screw retirement.</span>"
    ),
    new CheatsheetItem(
      "~",
      "Lyric lines start with a tilde ~",
      "<span class='dialogue_character'>OOMPA LOOMPAS</span><span class='lyrics'>~Willy Wonka! Willy Wonka! The amazing chocolatier!</span>"
    ),
  ];

  cheatSheet["Emphasis"] = [
    new CheatsheetItem(
      "*Italics*",
      "",
      "<span class='italics'>*italicized text*</span>"
    ),
    new CheatsheetItem(
      "**Bold**",
      "",
      "<span class='bold'>**bolded text**</span>"
    ),
    new CheatsheetItem(
      "***Bold Italics***",
      "",
      "<span class='bold italics'>***bolded and italicized text***</span>"
    ),
    new CheatsheetItem(
      "_Underline_",
      "",
      "<span class='underline'>_underlined text_</span>"
    ),
    new CheatsheetItem(
      "|Centered|",
      "",
      "<span class='centered'>|THE END|</span>"
    ),
  ];

  cheatSheet["Assets"] = [
    new CheatsheetItem(
      "[[image]]",
      "Display an image by wrapping the image name in double brackets",
      `<span class='dialogue_character'>BRUCE</span>
<span class='note'>[[b_frown]]</span>
<span class='dialogue'>Don't you know who I am?</span>`
    ),
    new CheatsheetItem(
      "((audio))",
      "Play an audio file by wrapping the audio name in double parenthesis",
      `<span class='dialogue_character'>BRUCE</span>
<span class='note'>((b_grumble))</span>
<span class='dialogue_parenthetical'>(in a gravelly voice)</span>
<span class='dialogue'>Don't you know who I am?</span>`
    ),
  ];

  cheatSheet["Flow"] = [
    new CheatsheetItem(
      "# Section",
      "Create a Section by starting a line with one or more pound-signs #",
      "<span class='section'># ActOne\n\n## PartOne\n\n</span><span class='scene'>INT. THE BATCAVE - NIGHT</span>"
    ),
    new CheatsheetItem(
      "> JumpToSection",
      "Jump to another section with > SectionName",
      `<span class='section'># TheBatcave</span>
<span class='dialogue_character'>\nBATMAN</span>
<span class='dialogue'>To the Batmobile!</span>
<span class='action'>\n<span class='keyword'>> TheBatmobile</mark></span>`
    ),
    new CheatsheetItem(
      "^",
      "Repeat the current section with a caret ^",
      `<span class='section'># HereWeGoAgain</span>
<span class='dialogue_character'>\nROBIN</span>
<span class='dialogue'>Woah... Deja vu.</span>
<span class='keyword'>\n^</span>
`
    ),
    new CheatsheetItem(
      "+ Choice > Section",
      "Display a choice by starting a line with a plus sign +",
      `<span class='action'>Where do you want to go?</span>
<span class='action'><mark class='keyword'>+</mark> To the Batcave! <mark class='keyword'>> TheBatcave</mark></span>
<span class='action'><mark class='keyword'>+</mark> To Wayne Manor! <mark class='keyword'>> WayneManor</mark></span>
`
    ),
  ];

  cheatSheet["Variables"] = [
    new CheatsheetItem(
      "@ number count = 0",
      "Declare a variable",
      `<span class='keyword'>@ string name = "John"</span>
<span class='keyword'>@ number score = 100</span>
<span class='keyword'>@ boolean alive = true</span>`
    ),
    new CheatsheetItem(
      "* count = 1",
      "Set a declared variable with =",
      `<span class='keyword'>* name = "Johnny"</span>`
    ),
    new CheatsheetItem(
      "* count += 1",
      "Increment a declared variable with +=",
      `<span class='keyword'>* score += 10</span>`
    ),
    new CheatsheetItem(
      "* count -= 1",
      "Decrement a declared variable with -=",
      `<span class='keyword'>* score -= 10</span>
`
    ),
  ];

  cheatSheet["Conditions"] = [
    new CheatsheetItem(
      "* if (condition):",
      "Any lines that are indented below an 'if' statement will only execute if the condition is true",
      `<span class='condition'>* if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='keyword'>  > GameOver</span>
`
    ),
    new CheatsheetItem(
      "* elseif (condition):",
      "'elseif' statements are checked if the proceeding 'if' condition is false",
      `<span class='condition'>* if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='keyword'>  > GameOver</span>
<span class='condition'>* elseif (health == max_health):</span>
<span class='action'>  You are fully healed.</span>
`
    ),
    new CheatsheetItem(
      "* else:",
      "An 'else' statement is executed if all proceeding 'if' or 'elseif' conditions are false",
      `<span class='condition'>* if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='keyword'>  > GameOver</span>
<span class='condition'>* elseif (health == max_health):</span>
<span class='action'>  You are fully healed.</span>
<span class='condition'>* else:</span>
<span class='action'>  You are scathed, but still able to fight.</span>
`
    ),
  ];

  cheatSheet["Dynamics"] = [
    new CheatsheetItem(
      "{count}",
      "Display the current value of a variable by wrapping it in curly brackets",
      `<span class='keyword'>@ number score = 1</span>
<span class='action'>\nYour current score is <mark class='keyword'>{score}</mark>.</span>`
    ),
    new CheatsheetItem(
      "{count:item|items}",
      "Pluralize a word according to a variable value",
      `<span class='keyword'>@ number count = 1</span>
<span class='action'>\nSally approached the sea shore with her <mark class='keyword'>{count:shell|shells}</mark>.</span>
<span class='dialogue_character'>\nSALLY</span>
<span class='dialogue'>I have <mark class='keyword'>{count}</mark> sea <mark class='keyword'>{count:shell|shells}</mark> for sale!</span>`
    ),
    new CheatsheetItem(
      "{switch:on|off}",
      "Display different text according to a boolean value",
      `<span class='action'>You did <mark class='keyword'>{success:terribly...|very well!}</mark></span>`
    ),
    new CheatsheetItem(
      "{first|second|third|fourth}",
      "Display different text every time the player returns to the current section",
      `<span class='action'>This is the <mark class='keyword'>{first|second|third|fourth}</mark> time you've seen this.</span>`
    ),
    new CheatsheetItem(
      "{first|second|third|always from now on|+}",
      "End a dynamic sequence with + to repeat the last option once all other options have been exhausted",
      `<span class='action'><mark class='keyword'>{I bought a cookie.|I bought another cookie.|I cannot afford any more cookies.|+}</mark></span>`
    ),
    new CheatsheetItem(
      "{~|spade|club|heart|diamond}",
      "Start a dynamic sequence with ~ to shuffle the options",
      `<span class='action'>You drew <mark class='keyword'>{~|an ace|a king|a queen|a jack}</mark> from the deck.</span>`
    ),
    new CheatsheetItem(
      "{~~|rock|paper|scissors}",
      "Start a dynamic sequence with ~~ to fully randomize the options (allows repeats)",
      `<span class='action'>You rolled a <mark class='keyword'>{~~|one|two|three|four|five|six}</mark> on the dice.</span>`
    ),
    new CheatsheetItem(
      "> {First|Second|Third}",
      "You can use dynamic sequences in jumps and choices",
      `<span class='action'>Are you sure you want to try again?</span>
<span class='action'><mark class='keyword'>+</mark> Just one more time... <mark class='keyword'>></mark> <mark class='keyword'>{First|Second|Third}</mark></span>
<span class='action'><mark class='keyword'>+</mark> I give up! <mark class='keyword'>> GoHome</mark></span>`
    ),
  ];

  cheatSheet["Misc."] = [
    new CheatsheetItem(
      "Title:",
      "The optional Title Page is always the first thing in a Sparkdown document",
      `<span><mark class='tkey'>Title</mark>: </span>
<span class='tvalue'>    BRICK & STEEL</span>
<span class='tvalue'>    FULL RETIRED</span>
<span><mark class='tkey'>Credit</mark>: <mark class='tvalue'>Written by</mark></span>
<span><mark class='tkey'>Author</mark>: <mark class='tvalue'>Stu Maschwitz</mark></span>
<span><mark class='tkey'>Source</mark>: <mark class='tvalue'>Story by KTM</mark></span>
<span><mark class='tkey'>Draft date</mark>: <mark class='tvalue'>1/20/2012</mark></span>
<span><mark class='tkey'>Contact</mark>:
<span>    <mark class='tvalue'>Next Level Productions</mark></span>
<span>    <mark class='tvalue'>1588 Mission Dr.</mark></span>
<span>    <mark class='tvalue'>Solvang, CA 93463</mark></span>`
    ),
    new CheatsheetItem(
      "===",
      "Page Breaks are indicated by a line containing three or more consecutive = signs",
      `<span class='centered'>&gt;<mark class='underline'>_END OF ACT ONE_</mark>&lt;</span>
<span class='linebreak'>\n===</span>
<span class='section'>\n# Act Two</span>`
    ),
    new CheatsheetItem(
      "=",
      "Synopses are single lines prefixed by = an equals sign.",
      "<span class='synopse'>= Player must hit all targets to win.</span>",
      "Printed: ✔ | Executed: ✖"
    ),
    new CheatsheetItem(
      "/* */",
      "Boneyards are wrapped with /* boneyard markers */.",
      "<span class='boneyard'>/*\nscore += 5\n*/</span>",
      "Printed: ✖ | Executed: ✔"
    ),
    new CheatsheetItem(
      "//",
      "Comments are single lines prefixed by // two forward-slashes.",
      "<span class='note'>// TODO: Add more dialogue choices</span>",
      "Printed: ✖ | Executed: ✖"
    ),
  ];

  return cheatSheet;
};
