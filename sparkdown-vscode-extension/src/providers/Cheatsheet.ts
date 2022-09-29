import * as vscode from "vscode";

export class SparkdownCheatSheetWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      localResourceRoots: [this._extensionUri],
    };

    const cssDiskPath = vscode.Uri.joinPath(
      this._extensionUri,
      "out",
      "webviews",
      "cheatsheet.css"
    );
    const styleUri = webviewView.webview.asWebviewUri(cssDiskPath).toString();
    const codiconDiskPath = vscode.Uri.joinPath(
      this._extensionUri,
      "node_modules",
      "vscode-codicons",
      "dist",
      "codicon.css"
    );
    const codiconUri = webviewView.webview
      .asWebviewUri(codiconDiskPath)
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

    webviewView.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
              webviewView.webview.cspSource
            } 'unsafe-inline'; font-src https://* file://*">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
           
            <title>Cheat Sheet</title>
            <link rel="stylesheet" href="${styleUri}">
            <link rel="stylesheet" type="text/css" href="${codiconUri}">
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
        </body>
        </html>`;
  }
}

class CheatsheetItem {
  label: string;
  highlights?: [number, number][];
  constructor(
    public keyword: string,
    public description: string,
    public example: string
  ) {
    this.label = `${keyword} ${description}`.trim();
    this.highlights = [[0, keyword.length]];
  }
}

const getCheatSheetAsHtml = () => {
  let result = "";
  Object.entries(getCheatSheet()).forEach(([categoryName, cheatsheetItems]) => {
    result += `<details class="category"><summary><span class="">${categoryName}</span></summary><div>`;
    cheatsheetItems.forEach((item) => {
      result += `<details class="cheat-item"><summary><span class="keyword">${item.keyword}</span> <span>${item.description}</span></summary> 
            <p class="example">${item.example}</p>
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
      "<span class='scene'>INT./EXT. RONNA'S CAR - NIGHT [DRIVING]</span>"
    ),
    new CheatsheetItem(
      "TO:",
      "Transitions should be upper case, ending in ' TO:'",
      "Jack begins to argue vociferously in Vietnamese (?), But mercifully we...\n\n<span class='transition'>CUT TO:</span>\n\n<span class='scene'>EXT. BRICK'S POOL - DAY</span>"
    ),
    new CheatsheetItem(
      "!",
      "Action (aka scene description) is any paragraph that doesn't meet criteria for another element",
      `They drink long and well from the beers.\n\nAnd then there's a long beat.\nLonger than is funny.\nLong enough to be depressing.`
    ),
  ];

  cheatSheet["Dialogue"] = [
    new CheatsheetItem(
      "@",
      "Character names should be in upper case",
      "<span class='character'>STEEL</span>\n<span class='dialogue'>The man's a myth!</span>"
    ),
    new CheatsheetItem(
      "()",
      "Parentheticals follow a Character or Dialogue element, and are wrapped in parentheses ()",
      "<span class='character'>STEEL</span>\n<span class='parenthetical'>(starting the engine)</span><span class='dialogue'>\nSo much for retirement!</span>"
    ),
    new CheatsheetItem(
      "…",
      "Dialogue is any text following a Character or Parenthetical element",
      "<span class='character'>SANBORN</span>\n<span class='dialogue'>A good 'ole boy.</span>"
    ),
    new CheatsheetItem(
      "^",
      "Dual (aka simultaneous) dialogue is expressed by adding a caret ^ after the second Character element",
      "<span class='character'>BRICK</span>\n<span class='dialogue'>Screw retirement.</span>\n\n<span class='character'>STEEL</span><span class='caret'> ^</span>\n<span class='dialogue'>Screw retirement.</span>"
    ),
    new CheatsheetItem(
      "~",
      "Lyric lines start with a tilde ~",
      `<span class='character'>OOMPA LOOMPAS</span>
<span class='lyrics'>~Willy Wonka! Willy Wonka! The amazing chocolatier!</span>`
    ),
  ];

  cheatSheet["Emphasis"] = [
    new CheatsheetItem(
      "*italics*",
      "italics",
      "<span class='italics'>*italics*</span>"
    ),
    new CheatsheetItem("**bold**", "Bold text", "<span class='bold'>**bold**"),
    new CheatsheetItem(
      "***bold italics***",
      "Bold and italics text",
      "<span class='bold italics'>***bold italics***</span>"
    ),
    new CheatsheetItem(
      "_underline_",
      "Underline text",
      "<span class='underline'>_underline_</span>"
    ),
    new CheatsheetItem(
      ">centered<",
      "Centered text is bracketed with greater/less-than",
      "<span class='centered'>&gt;THE END&lt;</span>"
    ),
  ];

  cheatSheet["Assets"] = [
    new CheatsheetItem(
      "[[image]]",
      "Display an image by wrapping the image name in double brackets",
      `<span class='character'>BRUCE</span>
<span class='note'>[[b_frown]]</span>
<span class='parenthetical'>(in a gravelly voice)</span>
<span class='dialogue'>Don't you know who I am?</span>`
    ),
    new CheatsheetItem(
      "[[(audio)]]",
      "Play an audio file by wrapping the audio name in double brackets and parenthesis",
      `<span class='character'>BRUCE</span>
<span class='note'>[[(b_grumble)]]</span>
<span class='parenthetical'>(in a gravelly voice)</span>
<span class='dialogue'>Don't you know who I am?</span>`
    ),
  ];

  cheatSheet["Flow"] = [
    new CheatsheetItem(
      "# Section",
      "Create a Section by starting a line with one or more pound-signs #",
      "<span class='sequence'># ActOne\n\n## PartOne\n\n</span><span class='scene'>INT. THE BATCAVE - NIGHT</span>"
    ),
    new CheatsheetItem(
      "> JumpToSection",
      "Jump to another section with > SectionName",
      `<span class='sequence'># TheBatcave</span>

<span class='character'>BATMAN</span>
<span class='dialogue'>To the Batmobile!</span>

<span class='action'>> TheBatmobile</span>

<span class='sequence'># TheBatmobile</span>`
    ),
    new CheatsheetItem(
      "^",
      "Repeat the current section with a caret ^",
      `<span class='sequence'># HereWeGoAgain</span>

<span class='character'>ROBIN</span>
<span class='dialogue'>Woah... Deja vu.</span>

<span class='action'>^</span>
`
    ),
    new CheatsheetItem(
      "+ Choice > Section",
      "Display a choice by starting a line with a plus sign +",
      `<span class='sequence'># TheBatmobile</span>

<span class='action'>You start the engine.</span>

<span class='action'>Where do you want to go?</span>
<span class='action'>+ To the Batcave! > TheBatcave</span>
<span class='action'>+ To Wayne Manor! > WayneManor</span>
`
    ),
    new CheatsheetItem(
      "- Choice > Section",
      "Choices prefixed by - will be hidden after they are chosen",
      `<span class='sequence'># BatUtilityCloset</span>

<span class='character'>BATMAN</span>
<span class='dialogue'>Should I take anything else?</span>
<span class='action'>- Batarangs > GrabBatarangs</span>
<span class='action'>- Grappling hook > GrabGrapplingHook</span>
<span class='action'>- Shark repellant > GrabSharkRepellant</span>
<span class='action'>+ I have everything I need. > HeadOut</span>
`
    ),
  ];

  cheatSheet["Variables"] = [
    new CheatsheetItem(
      "var count = 1",
      "Declare a variable with var",
      `<span class='action'>var name = "John"</span>
<span class='action'>var health = 100</span>
<span class='action'>var alive = true</span>`
    ),
    new CheatsheetItem(
      "* count += 1",
      "Set a declared variable with *",
      `<span class='action'>* damage = 5</span>
<span class='action'>* damage -= debuff</span>
<span class='action'>* alive = (health - damage) < 0</span>
`
    ),
  ];

  cheatSheet["Variables"] = [
    new CheatsheetItem(
      "var count = 1",
      "Declare a variable with var",
      `<span class='action'>var count = 1</span>`
    ),
    new CheatsheetItem(
      "* count += 1",
      "Set a declared variable with *",
      `<span class='action'>* count += 1</span>
<span class='action'>* multiplier = 2</span>
<span class='action'>* score = count * multiplier</span>
`
    ),
  ];

  cheatSheet["Conditions"] = [
    new CheatsheetItem(
      "if (condition):",
      "Any lines that are indented below an 'if' statement will only execute if the condition is true",
      `<span class='action'>if (health < 0):</span>
  <span class='action'>You are dead.</span>
  <span class='action'>> GameOver</span>
`
    ),
    new CheatsheetItem(
      "elif (condition):",
      "'elif' statements are checked if the proceeding 'if' or 'elif' conditions are false",
      `<span class='action'>if (health < 0):</span>
  <span class='action'>You are dead.</span>
  <span class='action'>> GameOver</span>
<span class='action'>elif (health == max_health):</span>
  <span class='action'>You are fully healed.</span>
`
    ),
    new CheatsheetItem(
      "else:",
      "An 'else' statement is executed if all proceeding conditions are false",
      `<span class='action'>if (health < 0):</span>
  <span class='action'>You are dead.</span>
  <span class='action'>> GameOver</span>
<span class='action'>elif (health == max_health):</span>
  <span class='action'>You are fully healed.</span>
<span class='action'>else:</span>
  <span class='action'>You are scathed, but still able to fight.</span>
`
    ),
  ];

  cheatSheet["Dynamics"] = [
    new CheatsheetItem(
      "{count}",
      "Display the current value of a variable by wrapping it in curly brackets",
      `<span class='action'>var score = 1</span>

<span class='action'>Your current score is {score}.</span>`
    ),
    new CheatsheetItem(
      "{count:item|items}",
      "Pluralize a word according to a variable value",
      `<span class='action'>var count = 1</span>

<span class='action'>Sally approached the sea shore with her {count:shell|shells}.</span>

<span class='character'>SALLY</span>
<span class='dialogue'>I have {count} sea {count:shell|shells} on sale!</span>`
    ),
    new CheatsheetItem(
      "{switch:on|off}",
      "Display different text according to a boolean value",
      `<span class='action'>You did {success:terribly...|very well!}</span>`
    ),
    new CheatsheetItem(
      "{first|second|third|fourth}",
      "Display different text every time the player returns to the current section",
      `<span class='action'>This is the {first|second|third|fourth} time you've seen this.</span>`
    ),
    new CheatsheetItem(
      "{first|second|third|always from now on|+}",
      "End a dynamic sequence with + to repeat the last option once all other options have been exhausted",
      `<span class='action'>{I bought a cookie.|I bought another cookie.|I cannot afford any more cookies.|+}</span>`
    ),
    new CheatsheetItem(
      "{~|spade|club|heart|diamond}",
      "Start a dynamic sequence with ~ to shuffle the options",
      `<span class='action'>You drew {~|an ace|a king|a queen|a jack} of {~|spades|clubs|hearts|diamonds} from the deck.</span>`
    ),
    new CheatsheetItem(
      "{~~|rock|paper|scissors}",
      "Start a dynamic sequence with ~~ to fully randomize the options (allows repeats)",
      `<span class='action'>You rolled a {~~|one|two|three|four|five|six} on the dice.</span>`
    ),
    new CheatsheetItem(
      "> {first|second|third}",
      "You can use dynamic sequences in jumps and choices",
      `<span class='action'>Are you sure you want to try again?</span>
<span class='action'>+ Just one more time... > {first|second|third}</span>
<span class='action'>+ I give up! > GoHome</span>`
    ),
  ];

  cheatSheet["Misc."] = [
    new CheatsheetItem(
      "Title:",
      "The optional Title Page is always the first thing in a Sparkdown document",
      `<span class='tkey'>Title</span>:
    <span class='tvalue'>_**BRICK & STEEL**_
    _**FULL RETIRED**_</span>
<span class='tkey'>Credit</span>: <span class='tvalue'>Written by</span>
<span class='tkey'>Author</span>: <span class='tvalue'>Stu Maschwitz</span>
<span class='tkey'>Source</span>: <span class='tvalue'>Story by KTM</span>
<span class='tkey'>Draft date</span>: <span class='tvalue'>1/20/2012</span>
<span class='tkey'>Contact</span>:
    <span class='tvalue'>Next Level Productions
    1588 Mission Dr.
    Solvang, CA 93463</span>`
    ),
    new CheatsheetItem(
      "===",
      "Page Breaks are indicated by a line containing three or more consecutive = signs",
      "<span class='centered '>&gt;<span class='bold'>_END OF ACT ONE_</span>&lt;\n\n<span class='linebreak'>===</span>\n\n# Act Two"
    ),
    new CheatsheetItem(
      "=",
      "Synopses are single lines prefixed by = an equals sign [Displayed in Screenplay: ✔ | Executed in Game: ✖]",
      "<span class='synopse'>= Player must dodge all the balls to win.</span>"
    ),
    new CheatsheetItem(
      "/* */",
      "Boneyards are wrapped with /* boneyard markers */ [Displayed in Screenplay: ✖ | Executed in Game: ✔]",
      "<span class='boneyard'>/*\nscore += 5\n*/</span>"
    ),
    new CheatsheetItem(
      "//",
      "Comments are single lines prefixed by // two forward-slashes [Displayed in Screenplay: ✖ | Executed in Game: ✖]",
      "<span class='note'>// TODO: Add more dialogue choices</span>"
    ),
  ];

  return cheatSheet;
};
