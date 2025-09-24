import * as vscode from "vscode";
import { getWebviewUri } from "../utils/getWebviewUri";

export class SparkdownCheatSheetWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      localResourceRoots: [this._extensionUri],
    };

    const styleUriString = getWebviewUri(
      webviewView.webview,
      this._extensionUri,
      ["out", "data", "cheatsheet.css"]
    ).toString();
    const codiconUriString = getWebviewUri(
      webviewView.webview,
      this._extensionUri,
      ["out", "data", "codicon.css"]
    ).toString();

    const fontUri = getWebviewUri(webviewView.webview, this._extensionUri, [
      "out",
      "data",
      "courier-prime.ttf",
    ]).toString();
    const fontUriBold = getWebviewUri(webviewView.webview, this._extensionUri, [
      "out",
      "data",
      "courier-prime-bold.ttf",
    ]).toString();
    const fontUriItalic = getWebviewUri(
      webviewView.webview,
      this._extensionUri,
      ["out", "data", "courier-prime-italic.ttf"]
    ).toString();
    const fontUriBoldItalic = getWebviewUri(
      webviewView.webview,
      this._extensionUri,
      ["out", "data", "courier-prime-bold-italic.ttf"]
    ).toString();

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
                font-display: block;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriBold});
                font-weight: bold;
                font-display: block;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriItalic});
                font-weight: normal;
                font-style: italic;
                font-display: block;
            }
            @font-face{
                font-family: sparkdown-font;
                src:url(${fontUriBoldItalic});
                font-weight: bold;
                font-style: italic;
                font-display: block;
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
  cheatSheet["Displaying Text"] = [
    new CheatsheetItem(
      "@",
      "Character names are prefixed with an @ symbol",
      `
<span class='dialogue_character'>@ STEEL</span>
<span class='dialogue'>The man's a myth!</span>`.trim()
    ),
    new CheatsheetItem(
      "…",
      "Dialogue is any text on a line following an @ character name. A character's dialogue block is ended with a blank line.",
      `
<span class='dialogue_character'>@ DEALER</span>
<span class='dialogue'>Ten. Four.</span>
<span class='dialogue'>Dealer gets a seven. Hit or stand sir?</span>
<span>
</span>
<span class='dialogue_character'>@ MONKEY</span>
<span class='dialogue'>Dude, I'm a monkey.</span>`.trim()
    ),
    new CheatsheetItem(
      ">",
      "At runtime, all lines of a dialogue block are displayed in the same dialogue box. To move a line of dialogue to a new dialogue box, end the line with &gt",
      `
<span class='dialogue_character'>@ DAN</span>
<span class='dialogue'>Then let's retire them. <span class='keyword'>&gt</span></span>
<span class='dialogue'>Permanently.</span>`.trim()
    ),
    new CheatsheetItem(
      "()",
      "Parentheticals are lines that start with an open parenthesis ( and end with a closed parenthesis )",
      `
<span class='dialogue_character'>@ STEEL</span>
<span class='parenthetical'>(starting the engine)</span>
<span class='dialogue'>So much for retirement!</span>`.trim()
    ),
    new CheatsheetItem(
      "[<]",
      "Dual (aka simultaneous) dialogue is expressed by adding [<] after the name of the character that should appear on the left and [>] after the name of the character that should appear on the right",
      `
<span class='dialogue_character'>@ BRICK <mark class='caret'>[&lt]</mark></span>
<span class='dialogue'>Screw retirement.</span>
<span>
</span>
<span class='dialogue_character'>@ STEEL <mark class='caret'>[&gt]</mark></span>
<span class='dialogue'>Screw retirement.</span>`.trim()
    ),
    new CheatsheetItem(
      "$",
      "Heading text is prefixed with a $",
      `
<span class='heading'>$ INT. BRICK'S ROOM - DAY</span>`.trim()
    ),
    new CheatsheetItem(
      "%",
      "Transitional text is prefixed with a %",
      `
<span class='transitional'>% CUT TO:</span>`.trim()
    ),
    new CheatsheetItem(
      "!",
      "Action text is any paragraph that doesn't meet criteria for another element. It can also be explicitly prefixed with a !",
      `
The men look at each other.`.trim()
    ),
  ];

  cheatSheet["Styling Text"] = [
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
      "^Centered^",
      "",
      "<span class='centered'>^centered text^</span>"
    ),
    new CheatsheetItem(
      "::Shaky::",
      "",
      "<span class='inline'>::<span class='shaky' style='animation-delay:calc(0.06s*1)'>s</span><span class='shaky' style='animation-delay:calc(0.06s*2)'>h</span><span class='shaky' style='animation-delay:calc(0.06s*3)'>a</span><span class='shaky' style='animation-delay:calc(0.06s*4)'>k</span><span class='shaky' style='animation-delay:calc(0.06s*5)'>y</span><span class='shaky' style='animation-delay:calc(0.06s*6)'> </span><span class='shaky' style='animation-delay:calc(0.06s*7)'>t</span><span class='shaky' style='animation-delay:calc(0.06s*8)'>e</span><span class='shaky' style='animation-delay:calc(0.06s*9)'>x</span><span class='shaky' style='animation-delay:calc(0.06s*10)'>t</span>::</span>"
    ),
    new CheatsheetItem(
      "~~Wavy~~",
      "",
      "<span class='inline'>~~<span class='wavy' style='animation-delay:calc(0.06s*1)'>w</span><span class='wavy' style='animation-delay:calc(0.06s*2)'>a</span><span class='wavy' style='animation-delay:calc(0.06s*3)'>v</span><span class='wavy' style='animation-delay:calc(0.06s*4)'>y</span><span class='wavy' style='animation-delay:calc(0.06s*5)'> </span><span class='wavy' style='animation-delay:calc(0.06s*6)'>t</span><span class='wavy' style='animation-delay:calc(0.06s*7)'>e</span><span class='wavy' style='animation-delay:calc(0.06s*8)'>x</span><span class='wavy' style='animation-delay:calc(0.06s*9)'>t</span>~~</span>"
    ),
    new CheatsheetItem(
      "`Raw`",
      "(displayed without any styling)",
      "`¯\\_(ツ)_/¯`"
    ),
  ];

  cheatSheet["Asset Commands"] = [
    new CheatsheetItem(
      "[[image]]",
      "Display an image by wrapping the image name in double brackets",
      `
<span class='dialogue_character'>@ BRUCE</span>
<span class='note'>[[bruce_frown]]</span>
<span class='dialogue'>Don't you know who I am?</span>`.trim()
    ),
    new CheatsheetItem(
      "((audio))",
      "Play an audio file by wrapping the audio name in double parenthesis",
      `
<span class='dialogue_character'>@ BATMAN</span>
<span class='note'>((sfx_thunder))</span>
<span class='dialogue'>I'm Batman.</span>`.trim()
    ),
  ];

  cheatSheet["Diverting Flow"] = [
    new CheatsheetItem(
      "scene",
      "Declare a scene",
      "<span class='section'>scene ActOne:</span>"
    ),
    new CheatsheetItem(
      "branch",
      "Declare a branch",
      "<span class='section'>scene ActOne:\n\n  branch PartA:</span>"
    ),
    new CheatsheetItem(
      "function:",
      "Declare a function",
      `
<span class='section'>function add(x, y):</span>
<span class='keyword'>  return x + y</span>`.trim()
    ),
    new CheatsheetItem(
      "-> SceneOrBranch",
      "Jump to another scene or branch with -> SceneOrBranchName",
      `
<span class='section'>scene TheBatcave</span>
<span>
</span>
<span class='dialogue_character'>@ BATMAN</span>
<span class='dialogue'>To the Batmobile!</span>
<span>
</span>
<span class='action'><span class='divert'>-></span> <span class='divert_target'>TheBatmobile</span></span>`.trim()
    ),
    new CheatsheetItem(
      "+ Choice -> SceneOrBranch",
      "Display a sticky choice that diverts to a scene or branch",
      `
<span class='action'>Where do you want to go?</span>
<span class='action'><mark class='keyword'>+</mark> To the Batcave! <span class='divert'>-></span> <span class='divert_target'>TheBatcave</span></span>
<span class='action'><mark class='keyword'>+</mark> To Wayne Manor! <span class='divert'>-></span> <span class='divert_target'>WayneManor</span></span>
<span class='action'><mark class='keyword'>+</mark> To Crime Alley! <span class='divert'>-></span> <span class='divert_target'>CrimeAlley</span></span>
`.trim()
    ),
    new CheatsheetItem(
      "* Choice -> SceneOrBranch",
      "Display a transient choice (i.e. a choice that can only be picked once)",
      `
<span class='dialogue_character'>@ DETECTIVE</span>
<span class='dialogue'>And so the killer must be...</span>
<span class='action'><mark class='keyword'>*</mark> The butler! <span class='divert'>-></span> <span class='divert_target'>AccuseButler</span></span>
<span class='action'><mark class='keyword'>*</mark> You! <span class='divert'>-></span> <span class='divert_target'>AccusePartner</span></span>
<span class='action'><mark class='keyword'>*</mark> Myself! <span class='divert'>-></span> <span class='divert_target'>AccuseSelf</span></span>
`.trim()
    ),
  ];

  // TODO: Add function syntax to cheatsheet

  cheatSheet["Variables"] = [
    new CheatsheetItem(
      "const x = 0",
      "Declare a constant (cannot be changed)",
      `
<span class='keyword'>const MAX_POINTS = 100</span>`.trim()
    ),
    new CheatsheetItem(
      "var x = 0",
      "Declare a variable (can be set later)",
      `
<span class='keyword'>var name = "John"</span>
<span class='keyword'>var score = 100</span>
<span class='keyword'>var alive = true</span>`.trim()
    ),
    new CheatsheetItem(
      "temp x = 0",
      "Declare a temp (local to the current function, scene, or branch)",
      `
<span class='section'>function calculate():</span>
<span class='keyword'>temp count = 0</span>`.trim()
    ),
    new CheatsheetItem(
      "~ x = 1",
      "Set a declared variable",
      `
<span class='keyword'>~ name = "Johnny"</span>`.trim()
    ),
    new CheatsheetItem(
      "~ x += 1",
      "Increment a declared variable",
      `
<span class='keyword'>~ count += 10</span>`.trim()
    ),
    new CheatsheetItem(
      "~ x -= 1",
      "Decrement a declared variable",
      `
<span class='keyword'>~ score -= 10</span>`.trim()
    ),
  ];

  // TODO: Update to match ink inline condition syntax
  cheatSheet["Inline Conditions"] = [
    new CheatsheetItem(
      "{count}",
      "Display the current value of a variable by wrapping it in curly brackets",
      `
<span class='keyword'>@ number score = 1</span>
<span>
</span>
<span class='action'>Your current score is <mark class='keyword'>{score}</mark>.</span>`.trim()
    ),
    new CheatsheetItem(
      "{count:item|items}",
      "Pluralize a word according to a variable value",
      `
<span class='keyword'>@ number count = 1</span>
<span>
</span>
<span class='action'>Sally approached the sea shore with her <mark class='keyword'>{count:shell|shells}</mark>.</span>
<span>
</span>
<span class='dialogue_character'>@ SALLY</span>
<span class='dialogue'>I have <mark class='keyword'>{count}</mark> sea <mark class='keyword'>{count:shell|shells}</mark> for sale!</span>`.trim()
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
      `
<span class='action'>Are you sure you want to try again?</span>
<span class='action'><mark class='keyword'>+</mark> Just one more time... <mark class='keyword'>></mark> <mark class='keyword'>{First|Second|Third}</mark></span>
<span class='action'><mark class='keyword'>+</mark> I give up! <mark class='keyword'>> GoHome</mark></span>`.trim()
    ),
  ];

  // TODO: Update to match ink block condition syntax
  cheatSheet["Block Conditions"] = [
    new CheatsheetItem(
      "if (condition):",
      "Any lines that are indented below an 'if' statement will only execute if the condition is true",
      `
<span class='condition'>if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='action'>  <span class='divert'>-></span> <span class='divert_target'>GameOver</span></span>
`.trim()
    ),
    new CheatsheetItem(
      "elseif (condition):",
      "'elseif' statements are checked if the proceeding 'if' condition is false",
      `
<span class='condition'>if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='action'>  <span class='divert'>-></span> <span class='divert_target'>GameOver</span></span>
<span class='condition'>elseif (health == max_health):</span>
<span class='action'>  You are fully healed.</span>
`.trim()
    ),
    new CheatsheetItem(
      "else:",
      "An 'else' statement is executed if all proceeding 'if' or 'elseif' conditions are false",
      `
<span class='condition'>if (health < 0):</span>
<span class='action'>  You are dead.</span>
<span class='action'>  <span class='divert'>-></span> <span class='divert_target'>GameOver</span></span>
<span class='condition'>elseif (health == max_health):</span>
<span class='action'>  You are fully healed.</span>
<span class='condition'>else:</span>
<span class='action'>  You are scathed, but still able to fight.</span>
`.trim()
    ),
  ];

  cheatSheet["Misc."] = [
    new CheatsheetItem(
      "---",
      "Metadata can be declared by surrounding a block with three dashes. Keys are followed by a colon. Values can be multiple lines long.",
      `
<span class='keyword'>---</mark>
<span><mark class='tkey'>Title</mark>: </span>
<span class='tvalue'>    BRICK & STEEL</span>
<span class='tvalue'>    FULL RETIRED</span>
<span><mark class='tkey'>Credit</mark>: <mark class='tvalue'>Written by</mark></span>
<span><mark class='tkey'>Author</mark>: <mark class='tvalue'>Stu Maschwitz</mark></span>
<span><mark class='tkey'>Source</mark>: <mark class='tvalue'>Story by KTM</mark></span>
<span><mark class='tkey'>Date</mark>: <mark class='tvalue'>1/20/2012</mark></span>
<span><mark class='tkey'>Contact</mark>:
<span>    <mark class='tvalue'>Next Level Productions</mark></span>
<span>    <mark class='tvalue'>1588 Mission Dr.</mark></span>
<span>    <mark class='tvalue'>Solvang, CA 93463</mark></span>
<span class='keyword'>---</mark>
`.trim()
    ),
    new CheatsheetItem(
      "//",
      "Comments are not displayed at runtime or when printing to pdf",
      "<span class='note'>// TODO: Add more dialogue choices</span>"
    ),
  ];

  return cheatSheet;
};
