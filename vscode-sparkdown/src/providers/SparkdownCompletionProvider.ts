import { TITLE_PAGE_DISPLAY } from "@impower/sparkdown/src/constants/TITLE_PAGE_DISPLAY";
import { getCharactersWhoSpokeBeforeLine } from "@impower/sparkdown/src/utils/getCharactersWhoSpokeBeforeLine";
import * as vscode from "vscode";
import { addForceSymbolToCharacter } from "../utils/addForceSymbolToCharacter";
import { SparkProgramManager } from "./SparkProgramManager";

function TimeofDayCompletion(
  input: string,
  addspace: boolean,
  sort: string
): vscode.CompletionItem {
  return {
    label: " - " + input,
    kind: vscode.CompletionItemKind.Constant,
    filterText: "- " + input,
    sortText: sort,
    insertText: (addspace ? " " : "") + input + "\n\n",
  };
}
interface TitlePageKeyComplete {
  name: string;
  sort: string;
  detail: string;
  documentation?: string;
  triggerIntellisense?: boolean;
  deprecated?: boolean;
  position:
    | "tl"
    | "tc"
    | "tr"
    | "cc"
    | "bl"
    | "br"
    | "hidden"
    | "watermark"
    | "header"
    | "footer";
}
const pageDrawings = {
  tl: `Top Left:
╔══════╗
║▀▀    ║
║      ║
║      ║
╚══════╝`,
  tc: `Top Center:
╔══════╗
║  ▀▀  ║
║      ║
║      ║
╚══════╝`,
  tr: `Top Right:
╔══════╗
║    ▀▀║
║      ║
║      ║
╚══════╝`,
  cc: `Center:
╔══════╗
║      ║
║ ████ ║
║      ║
╚══════╝`,
  bl: `Bottom Left:
╔══════╗
║      ║
║      ║
║███   ║
╚══════╝`,
  br: `Bottom Right:
╔══════╗
║      ║
║      ║
║   ███║
╚══════╝`,
  watermark: `
╔══════╗
║    ⋰ ║
║  ⋰   ║
║⋰     ║
╚══════╝`,
  header: `
╚══════╝
╔══════╗
║▀▀▀▀▀▀║
║      ║`,
  footer: `
║      ║
║▄▄▄▄▄▄║
╚══════╝
╔══════╗`,
  hidden: `
	(Not printed on title page)`,
};
function TitlePageKey(info: TitlePageKeyComplete): vscode.CompletionItem {
  const documentation = new vscode.MarkdownString(info.documentation);
  if (info.position) {
    documentation.appendCodeblock(pageDrawings[info.position]);
  }
  const complete: vscode.CompletionItem = {
    label: info.name + ": ",
    kind: vscode.CompletionItemKind.Constant,
    filterText: "\n" + info.name,
    sortText: info.sort.toString(),
    detail: info.detail,
    documentation: documentation,
  };
  if (info.triggerIntellisense) {
    complete.command = {
      command: "editor.action.triggerSuggest",
      title: "triggersuggest",
    };
  }
  if (info.deprecated) {
    complete.tags = [1];
  }
  return complete;
}

export class SparkdownCompletionProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position /* token: CancellationToken, context: CompletionContext*/
  ): vscode.CompletionItem[] {
    const program = SparkProgramManager.instance.get(document.uri);
    const completes: vscode.CompletionItem[] = [];
    const currentLine = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), position)
    );
    const prevLine = document
      .getText(
        new vscode.Range(new vscode.Position(position.line - 1, 0), position)
      )
      .trimEnd();
    const hasCharacters =
      Object.keys(program?.metadata?.characters || {}).length > 0;
    const currentLineIsEmpty = currentLine === "";
    const previousLineIsEmpty = prevLine === "";
    const firstScriptLine = program?.metadata?.firstScriptLine ?? 0;

    //Title page autocomplete
    if (position.line <= firstScriptLine) {
      if (currentLine.indexOf(":") === -1) {
        if (!program?.frontMatter?.["title"]) {
          completes.push(
            TitlePageKey({
              name: "Title",
              detail: "The title of the screenplay",
              sort: "A",
              position: TITLE_PAGE_DISPLAY["title"].position,
            })
          );
        }
        if (!program?.frontMatter?.["credit"]) {
          completes.push(
            TitlePageKey({
              name: "Credit",
              detail: "How the author is credited",
              triggerIntellisense: true,
              documentation:
                'Inserted between the title and the author. Good practice is to simply use "Written by" (avoid "Created by" etc...).',
              sort: "B",
              position: TITLE_PAGE_DISPLAY["credit"].position,
            })
          );
        }
        if (!program?.frontMatter?.["author"]) {
          completes.push(
            TitlePageKey({
              name: "Author",
              detail: "The name of the author",
              sort: "C",
              triggerIntellisense: true,
              documentation:
                "This is you! If there are several authors, you can optionally use the 'authors' tag instead.",
              position: TITLE_PAGE_DISPLAY["author"].position,
            })
          );
        }
        if (!program?.frontMatter?.["source"]) {
          completes.push(
            TitlePageKey({
              name: "Source",
              detail: "An additional source for the screenplay",
              triggerIntellisense: true,
              documentation:
                "This will be inserted below the author, and is useful if the story has an additional source (such as 'Original story by x', 'Based on the novel by x', etc...)",
              sort: "D",
              position: TITLE_PAGE_DISPLAY["source"].position,
            })
          );
        }
        if (!program?.frontMatter?.["notes"]) {
          completes.push(
            TitlePageKey({
              name: "Notes",
              detail: "Additional notes",
              sort: "E",
              documentation:
                "Any additional notes you wish to include in the title page",
              position: TITLE_PAGE_DISPLAY["notes"].position,
            })
          );
        }
        if (
          !program?.frontMatter?.["draft_date"] &&
          !program?.frontMatter?.["draft date"]
        ) {
          completes.push(
            TitlePageKey({
              name: "Draft Date",
              detail: "The date of the current draft",
              triggerIntellisense: true,
              documentation:
                "Useful if you have several drafts and need to keep track of when they were written",
              sort: "F",
              position: TITLE_PAGE_DISPLAY["draft_date"].position,
            })
          );
        }
        if (!program?.frontMatter?.["date"]) {
          completes.push(
            TitlePageKey({
              name: "Date",
              detail: "The date of the screenplay",
              triggerIntellisense: true,
              documentation:
                "Only include the date it if necessary for production purposes. Someone reading your screenplay does not generally need to know when it was written.",
              sort: "G",
              position: TITLE_PAGE_DISPLAY["date"].position,
            })
          );
        }
        if (
          !program?.frontMatter?.["contact"] &&
          !program?.frontMatter?.["contact_info"] &&
          !program?.frontMatter?.["contact info"]
        ) {
          completes.push(
            TitlePageKey({
              name: "Contact",
              detail: "Contact details",
              sort: "H",
              documentation: "Your contact details (Address, email, etc...)",
              position: TITLE_PAGE_DISPLAY["contact"].position,
            })
          );
        }
        if (!program?.frontMatter?.["copyright"]) {
          completes.push(
            TitlePageKey({
              name: "Copyright",
              detail: "Copyright information",
              triggerIntellisense: true,
              documentation:
                "**Warning:** Including copyright information tends to be unnecessary, and may even seem unprofessional in some cases.",
              sort: "I",
              deprecated: true,
              position: TITLE_PAGE_DISPLAY["copyright"].position,
            })
          );
        }
        if (!program?.frontMatter?.["watermark"]) {
          completes.push(
            TitlePageKey({
              name: "Watermark",
              detail: "A watermark displayed on every page",
              documentation:
                "A watermark displayed diagonally on every single page",
              sort: "J",
              position: TITLE_PAGE_DISPLAY["watermark"].position,
            })
          );
        }
        if (!program?.frontMatter?.["font"]) {
          completes.push(
            TitlePageKey({
              name: "Font",
              detail: "The font used in the screenplay",
              triggerIntellisense: true,
              documentation: `Generally a monospace courier-type font. Sparkdown's default is [Courier Prime](https://quoteunquoteapps.com/courierprime/), with added support for cyrillic.`,
              sort: "K",
              position: TITLE_PAGE_DISPLAY["font"].position,
            })
          );
        }
        if (!program?.frontMatter?.["language"]) {
          completes.push(
            TitlePageKey({
              name: "Language",
              detail: "The language the screenplay is written in",
              documentation: `Generally the language's ISO code. Sparkdown's default is en-US`,
              sort: "K",
              position: TITLE_PAGE_DISPLAY["language"].position,
            })
          );
        }
        if (!program?.frontMatter?.["revision"]) {
          completes.push(
            TitlePageKey({
              name: "Revision",
              detail: "The name of the current and past revisions",
              documentation: `New revisions are generally printed on different-colored paper, and named accordingly. The WGA order for revisions is:
* White Draft (original)
* Blue Revision
* Pink Revision
* Yellow Revision
* Green Revision
* Goldenrod Revision
* Buff Revision
* Salmon Revision
* Cherry Revision
* Second Blue Revision
* Second Pink Revision
* Second Yellow Revision
* Second Green Revision
* Second Goldenrod Revision
* Second Buff Revision
* Second Salmon Revision
* Second Cherry Revision`,
              sort: "L",
              position: TITLE_PAGE_DISPLAY["revision"].position,
            })
          );
        }
        completes.push(
          TitlePageKey({
            name: "TL",
            detail: "Top Left",
            documentation:
              "Additional content in the top left of the title page",
            sort: "M",
            position: TITLE_PAGE_DISPLAY["tl"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "TC",
            detail: "Top Center",
            documentation:
              "Additional content in the top center of the title page",
            sort: "N",
            position: TITLE_PAGE_DISPLAY["tc"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "TR",
            detail: "Top Right",
            documentation:
              "Additional content in the top right of the title page",
            sort: "O",
            position: TITLE_PAGE_DISPLAY["tr"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "CC",
            detail: "Center Center",
            documentation: "Additional content in the center of the title page",
            sort: "P",
            position: TITLE_PAGE_DISPLAY["cc"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "BL",
            detail: "Bottom Left",
            documentation:
              "Additional content in the bottom left of the title page",
            sort: "Q",
            position: TITLE_PAGE_DISPLAY["bl"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "BR",
            detail: "Bottom Right",
            documentation:
              "Additional content in the bottom right of the title page",
            sort: "R",
            position: TITLE_PAGE_DISPLAY["br"].position,
          })
        );
        completes.push(
          TitlePageKey({
            name: "Header",
            detail: "Header used throughout the document",
            documentation:
              "This will be printed in the top left of every single page, excluding the title page. Can also be set globally by the 'Page Header' setting",
            sort: "S",
            position: "header",
          })
        );
        completes.push(
          TitlePageKey({
            name: "Footer",
            detail: "Header used throughout the document",
            documentation:
              "This will be printed in the bottom left of every single page, excluding the title page. Can also be set globally by the 'Page Footer' setting",
            sort: "T",
            position: "footer",
          })
        );
      } else {
        const currentKey = currentLine.trimEnd().toLowerCase();
        if (currentKey === "date:" || currentKey === "draft date:") {
          const dateString1 = new Date().toLocaleDateString();
          const dateString2 = new Date().toDateString();
          completes.push({
            label: dateString1,
            insertText: dateString1 + "\n",
            kind: vscode.CompletionItemKind.Text,
            sortText: "A",
            command: {
              command: "editor.action.triggerSuggest",
              title: "triggersuggest",
            },
          });
          completes.push({
            label: dateString2,
            insertText: dateString2 + "\n",
            kind: vscode.CompletionItemKind.Text,
            sortText: "B",
            command: {
              command: "editor.action.triggerSuggest",
              title: "triggersuggest",
            },
          });
        } else if (currentKey === "credit:") {
          completes.push({
            label: "By",
            insertText: "By\n",
            kind: vscode.CompletionItemKind.Text,
            command: {
              command: "editor.action.triggerSuggest",
              title: "triggersuggest",
            },
          });
          completes.push({
            label: "Written by",
            insertText: "Written by\n",
            kind: vscode.CompletionItemKind.Text,
            command: {
              command: "editor.action.triggerSuggest",
              title: "triggersuggest",
            },
          });
        } else if (currentKey === "source:") {
          completes.push({
            label: "Story by ",
            kind: vscode.CompletionItemKind.Text,
          });
          completes.push({
            label: "Based on ",
            kind: vscode.CompletionItemKind.Text,
          });
        } else if (currentKey === "copyright:") {
          completes.push({
            label: "(c)" + new Date().getFullYear() + " ",
            kind: vscode.CompletionItemKind.Text,
          });
        }
      }
    }
    //Scene header autocomplete
    else if (program?.metadata?.lines?.[position.line]?.scene !== undefined) {
      //Time of day
      if (currentLine.trimEnd().endsWith("-")) {
        const addSpace = !currentLine.endsWith(" ");
        completes.push(TimeofDayCompletion("DAY", addSpace, "A"));
        completes.push(TimeofDayCompletion("NIGHT", addSpace, "B"));
        completes.push(TimeofDayCompletion("DUSK", addSpace, "C"));
        completes.push(TimeofDayCompletion("DAWN", addSpace, "D"));
      } else {
        const sceneMatch = currentLine.match(
          /^((?:\*{0,3}_?)?(?:(?:int|ext|est|int\.?\/ext|i\.?\/e\.?).? ))/gi
        );
        if (sceneMatch) {
          const previousLabels = [];
          const sceneNames = Array.from(
            new Set((program?.metadata?.scenes || [])?.map((x) => x.name))
          );
          for (let index = 0; index < sceneNames.length; index++) {
            const sceneName = sceneNames[index];
            if (sceneName) {
              const spacePos = sceneName.indexOf(" ");
              if (spacePos !== -1) {
                const thisLocation = sceneName
                  .slice(sceneName.indexOf(" "))
                  .trimStart();
                if (previousLabels.indexOf(thisLocation) === -1) {
                  previousLabels.push(thisLocation);
                  if (
                    sceneName
                      .toLowerCase()
                      .startsWith(sceneMatch?.[0]?.toLowerCase() || "")
                  ) {
                    completes.push({
                      label: thisLocation,
                      sortText: "A" + (10 - (sceneMatch?.[0]?.length || 0)),
                    });
                    //The (10-scenematch[0].length) is a hack to avoid a situation where INT. would be before INT./EXT. when it should be after
                  } else {
                    completes.push({
                      label: thisLocation,
                      sortText: "B",
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
    //Other autocompletes
    else if (position.line > 0 && currentLineIsEmpty && previousLineIsEmpty) {
      //We aren't on the first line, and the previous line is empty

      //Get current scene number
      /*var this_scene_nb = -1;
			for (let index in sparkdownDocProps.scenes) {
				if (sparkdownDocProps.scenes[index].line < position.line)
					this_scene_nb = sparkdownDocProps.scenes[index].scene
				else
					break;
			}*/
      let charactersWhoSpokeBefore = undefined;
      const charactersFromCurrentSceneHash = new Set();
      if (program && hasCharacters) {
        // The characters who have spoke before
        charactersWhoSpokeBefore = getCharactersWhoSpokeBeforeLine(
          program,
          position.line
        );
        // To facilitate writing back-and-forth dialogue,
        // we assume the character who spoke most recently is the least likely character to speak next,
        // so we move them to the back of the queue
        const mostRecentCharacter = charactersWhoSpokeBefore.shift();
        if (mostRecentCharacter) {
          charactersWhoSpokeBefore.push(mostRecentCharacter);
        }
        if (charactersWhoSpokeBefore.length > 0) {
          charactersWhoSpokeBefore.forEach((character, index) => {
            const charWithForceSymbolIfNecessary =
              addForceSymbolToCharacter(character);
            charactersFromCurrentSceneHash.add(character);
            completes.push({
              label: charWithForceSymbolIfNecessary,
              kind: vscode.CompletionItemKind.Keyword,
              sortText: "0A" + index,
              command: {
                command: "type",
                arguments: [{ text: "\n" }],
                title: "newline",
              },
            });
          });
        } else {
          charactersWhoSpokeBefore = undefined;
        }
      }

      completes.push({
        label: "INT. ",
        sortText: "1B",
        command: {
          command: "editor.action.triggerSuggest",
          title: "triggersuggest",
        },
      });
      completes.push({
        label: "EXT. ",
        sortText: "1C",
        command: {
          command: "editor.action.triggerSuggest",
          title: "triggersuggest",
        },
      });
      completes.push({
        label: "INT/EXT. ",
        sortText: "1D",
        command: {
          command: "editor.action.triggerSuggest",
          title: "triggersuggest",
        },
      });

      if (hasCharacters) {
        let sortText = "2"; // Add all characters, but after the "INT/EXT" suggestions
        if (
          !charactersWhoSpokeBefore ||
          charactersWhoSpokeBefore.length === 0
        ) {
          sortText = "0A"; //There's no characters in the current scene, suggest characters before INT/EXT
        }
        Object.keys(program?.metadata?.characters || {}).forEach((key) => {
          if (!charactersFromCurrentSceneHash.has(key)) {
            completes.push({
              label: key,
              sortText: sortText,
              kind: vscode.CompletionItemKind.Text,
              command: {
                command: "type",
                arguments: [{ text: "\n" }],
                title: "newline",
              },
            });
          }
        });
      }
    }
    return completes;
  }
}
