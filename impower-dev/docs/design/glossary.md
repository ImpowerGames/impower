# Interface copy glossary

Strings in this glossary are quoted from the Folio prototype at commit `c2fe740`. The Source column is a path and line relative to the prototype's `prototype/` directory (for example `app.js:842`). A string is quoted exactly as written in the source: capitalisation, curly quotes, ellipsis and middle dots are kept. Where a string is built from parts, only the literal parts are quoted and the Note column says how they join. A leading or trailing space inside a quoted string is part of it; when a string has a space at both ends, one extra space is added inside the backticks, because Markdown removes one. Where one source line holds the string more than once, the first lines are listed. Entity spellings in markup are decoded (the source writes `&amp;` for the ampersand of `Saved in this browser. Open Save & sync.` at app.js:866).

## Old word → new word

The old editor (impower.dev today) uses Logic, assets, URL, cache, Untitled Game and the theme Paper. None of the old words appears as interface copy in the prototype except where noted. The Where column gives the surface and the source of the new word.

| Old | New | Where the new word appears |
| --- | --- | --- |
| Logic | `Story` | Rail link and bottom navigation tab (app.js:842); `Back to story` button on the Scripts, Assets, Share and Settings pages (app.js:2023); `Share your story` page heading (app.js:2201). The `Story` word also names the story sort (folio-files.js:79). The old word survives once, in lower case, in the Scripts file type description `Story and logic written in sparkdown.` (folio-settings.js:299). |
| assets | `Assets`, with the type tabs `Images`, `Audio`, `Video`, `Text`, `Fonts`, `Other` | Rail link and bottom navigation tab (app.js:843); Assets page header and section label (folio-assets.js:160); type tabs (folio-library.js:56 to folio-library.js:61); settings file types `Images`, `Audio`, `Fonts` (folio-settings.js:300). Lower-case `assets` remains in running sentences, for example `in your assets` (folio-tools.js:15) and `Assets root` (folio-assets.js:1674). |
| URL | `link` | Add menu row `Add a link` with the hint `A file hosted on the web` (folio-assets.js:2794); dialog title `Add a link` (folio-assets.js:2306); field label `Address` (folio-assets.js:1648); toast `Link saved.` (folio-assets.js:1450); type word `Link` (folio-library.js:78); caption word `link` (folio-assets.js:1190). The letters URL appear in no interface copy; the file ending `.url` appears only in the source. |
| cache | `saved` | Save captions: `Draft saved` (app.js:614), `Saved locally` (app.js:619), `Saved to this device` (app.js:2319). The word cache appears in no interface copy. |
| Untitled Game | `Untitled story` | Default project name in the top bar name field (app.js:350); default title in the project data (folio-project.js:30). Notes: folio/decisions.md:163. |
| Paper (theme id `paper`) | `Sepia` | Settings, Appearance, Theme grid (folio-themes.js:11); the Chalk note names it again (folio-themes.js:20). The id stays `paper` in the source (folio-themes.js:11). `Paper` is still the name of one option of Settings, Preview, Screenplay paper color (folio-settings.js:520); that is a different setting. |

The prototype's own notes state these further renames. The live markup is checked against each.

| Old (note) | New (note) | Live markup |
| --- | --- | --- |
| Insert | Add | change-list.md:496. Live: `Add` (folio-insert.js:339 sets the trigger label to `Add`). |
| Choose, menu | Choice Menu | change-list.md:444 (the addable block is named Choice Menu while `choose` stays in the source). Live: `Choice Menu` (folio-insert.js:114). |
| Browse | Browse scripts | change-list.md:595. Live: `Browse scripts` (app.js:2023). |
| Find, Find & replace | Search | change-list.md:58. Live: `Search` (folio-tools.js:205). |
| colour | color | change-list.md:91 and folio/decisions.md:456. Live: `Change color`, `Use color`, `Color changed to ` (folio-tools.js:210, app.js:1588). |
| Saved offline | Saved locally | folio/decisions.md:405. Live: `Saved locally` (app.js:619). |
| Scripts, Browse (sidebar) | Scenes and a count | change-list.md:588. Live markup differs; see Inconsistencies. |

## App menu

The app menu is a dialog. It opens from the sidebar footer on desktop and tablet and from the top-bar menu button on phones. Selecting Settings goes to the Settings page; the other items show a toast (see Toasts).

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Saved locally` | heading (dialog title; the same text is the sidebar footer label) | app.js:619 | status text, follows the save state |
| `Not saved locally` | heading / footer label when saving fails | app.js:619 |  |
| `Saving locally…` | heading / footer label while a save is pending | app.js:633 |  |
| `No account needed to start writing.` | description under the heading | app.js:3577 |  |
| `Sync with Google Drive` | menu item (button) | app.js:3577 |  |
| `Settings` | menu item (button) | app.js:2297, app.js:3577 |  |
| `Help & guide` | menu item (button) | app.js:3577 |  |
| `Report a bug` | menu item (button) | app.js:3577 |  |
| `Close app menu` | aria-label of the dialog's close button | app.js:3577 |  |
| `App menu` | tooltip (title) of the sidebar footer button; aria-label and title of the top-bar menu button on phones | app.js:876, app.js:1989 |  |
| `, app menu` | aria-label of the sidebar footer button is the current status followed by this suffix | app.js:626 |  |

## Top bar and save captions

The save caption sits under the project name at every width. The sidebar footer and the app menu use a different wording for the same state (see Inconsistencies). The prototype has no string for a project kept on Google Drive; see Absent from the prototype.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Folio · Spark Engine` | document title (the browser tab) | folio.html:2 |  |
| `Spark Engine home` | aria-label of the logo link | app.js:180 |  |
| `Project name` | aria-label (project name field; its tooltip is the name itself) | app.js:866 |  |
| `Untitled story` | default project name, shown when the story has no title | app.js:350 | also used by folio-project.js |
| `Draft saved` | caption under the project name (save status) | app.js:614, app.js:866 |  |
| `Draft not saved` | caption when saving fails | app.js:614, app.js:866 |  |
| `Saving draft…` | caption while a save is pending | app.js:632 |  |
| `Saved in this browser. Open Save & sync.` | tooltip (title) of the caption link, which opens the Save & sync section of Settings | app.js:866 |  |
| `Saved locally` | sidebar footer label (status) | app.js:619 |  |
| `Not saved locally` | sidebar footer label (status) | app.js:619 |  |
| `Saving locally…` | sidebar footer label (status) | app.js:633 |  |
| `Sync now` | aria-label and tooltip of the top-bar sync button; it is hidden because the prototype does not simulate a Drive project | app.js:872 |  |
| `Keep the name` | aria-label of the phone Done button while the name field has focus | app.js:875 |  |
| `Done` | button label (phone, while naming) | app.js:875, app.js:2023 |  |
| `Search` | aria-label of the top-bar search button | app.js:876, app.js:1983, app.js:1986 |  |
| `Search (` | tooltip of the top-bar search button: this text, the shortcut keys, then a closing bracket; when no keys are set it reads no shortcut | app.js:876, app.js:1986 |  |
| `no shortcut` | fallback inside the search tooltip | app.js:876, app.js:1986 |  |
| `Edit history` | group aria-label of the phone Undo and Redo pair | app.js:868 |  |
| `Undo edit` | aria-label (Undo button) | app.js:868 |  |
| `Undo` | tooltip (Undo button) | app.js:868 |  |
| `Redo edit` | aria-label (Redo button) | app.js:868 |  |
| `Redo` | tooltip (Redo button) | app.js:868 |  |
| ` in the story. Show problems` | aria-label of the story problem count: counts text, then this suffix | app.js:1214 | the counts use error, warning and note, each followed by s when the count is not 1 (app.js:1826) |
| ` in this script. Show problems` | aria-label of the script header problem icon: counts text, then this suffix | app.js:1192 |  |
| `Saved to this device` | row name in Settings, Save & sync | app.js:2319 | see Settings |
| `Draft saved on this device.` | toast after Format shortcut when the script cannot be formatted | app.js:3733 | see Toasts |

## Rail and navigation

The rail holds the three project destinations, the Outline and the app menu footer. On phones the same three destinations form the bottom navigation.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Story` | navigation label (rail link and bottom navigation tab) | app.js:842 |  |
| `Assets` | navigation label (rail link and bottom navigation tab) | app.js:843, app.js:2197 |  |
| `Share` | navigation label (rail link and bottom navigation tab) | app.js:844 |  |
| `Project` | aria-label of both navigation landmarks (rail and bottom navigation) | app.js:1989, app.js:2161 |  |
| `Outline` | heading of the rail's lower half | app.js:1986 |  |
| `Search` | aria-label and tooltip of the search button beside the Outline heading | app.js:876, app.js:1983, app.js:1986 |  |
| `Scenes will appear here as you write them.` | caption when the open script has no scenes | app.js:1907 |  |
| `Script setup` | outline row label, shown only when problems sit outside any scene; also the badge name | app.js:1854, app.js:1905, app.js:1932 |  |
| `Scene outline in` | aria-label of the outline list: this text plus the script name | app.js:1907 |  |
| `Inside` | aria-label of a scene's child list: this text, a space, then the description | app.js:1897 |  |
| `Scene` | word at the start of a scene row's description, then a colon, a space and the scene name | app.js:1845 |  |
| `Branch` | word at the start of a branch row's description, then a colon, a space and the branch name | app.js:1845 |  |
| `Choose:` | description prefix (choice menu row, followed by its question) | app.js:1843 |  |
| `Expand` | aria-label and tooltip of a scene's disclosure button: this word, then ` scene ` and the scene name | app.js:1893, app.js:2081 |  |
| `Collapse` | aria-label and tooltip of a scene's disclosure button, same composition | app.js:1893, app.js:2081 |  |
| `  scene  ` | the middle of that label | app.js:1893, app.js:2081 |  |
| `Scene total:` | badge aria-label prefix on a scene (then the counts, ` in ` and the scene label) | app.js:1858 |  |
| `. Includes choices and branches.` | badge tooltip suffix on a scene | app.js:1861 |  |
| `Whole story` | context line in the Problems to fix dialog when opened from the story count | app.js:1930 |  |
| `Back to outline` | aria-label and tooltip of the close button in the rail's Search and References views | app.js:1983, app.js:1985 |  |
| `References` | heading of the rail's References view | app.js:1985 |  |
| `Settings` | heading of the rail on the Settings page | app.js:2297, app.js:3577 |  |
| `Settings sections` | aria-label of the Settings page index | folio-settings.js:606, folio-settings.js:610 |  |
| `Resize sidebar` | aria-label of the sidebar divider | folio-split.js:80 |  |
| `Drag to resize. Arrow keys adjust; Enter or double-click resets.` | tooltip of the sidebar and pane dividers | folio-split.js:80, folio-split.js:81 |  |
| `Compact sidebar` | aria-valuetext of the sidebar divider when collapsed to icons | folio-split.js:57 |  |
| `Sidebar` | aria-valuetext prefix; followed by the width in pixels | folio-split.js:57 |  |
| `Resize script and preview panes` | aria-label of the divider between script and preview (Story page) | folio-split.js:81 |  |
| `Resize page and preview panes` | aria-label of the divider (Assets, Share and Settings pages) | app.js:2408 |  |
| `Resize scripts and preview panes` | aria-label of the divider (Scripts page) | app.js:2410 |  |

## Script header and writer's bar

The header holds the line-number toggle, the open script's name, Browse scripts and, on phones, Done. The bar under the script holds the writing tools, the caret readout and Add; on phones and tablets it also holds Indent, Dedent and Format, and Edit while reading.

### Script header

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Show line numbers` | aria-label of the line-number toggle | app.js:2023, folio-themes.js:124 |  |
| `Hide line numbers` | aria-label of the line-number toggle when numbers are on | folio-themes.js:124 |  |
| `Browse scripts` | button (label and aria-label) that opens the Scripts page | app.js:2023 |  |
| `Back to story` | button on the Scripts, Assets, Share and Settings pages | app.js:2023, app.js:2190, app.js:2197 |  |
| `Rename this script` | tooltip of the script name field (every script except Main) | app.js:1997 |  |
| `Script name` | aria-label of the script name field | app.js:1997 |  |
| `Keep the script's name` | aria-label of the phone Done button while the name field has focus | app.js:2023 |  |
| `Done` | button label | app.js:875, app.js:2023 |  |
| `Done editing` | aria-label of the phone Done button that leaves editing | app.js:2023 |  |
| `Script writing` | aria-label of the writing section | app.js:2182 |  |
| `Sparkdown script text` | aria-label of the editable script | folio-editor.js:606 |  |
| `Type the first line of your story, or tap the Add button below.` | caption on the first line of an empty script (editing) | folio-editor.js:593 |  |
| `Tap Edit to write the first line of your story.` | caption on the first line of an empty script (reading, phones) | folio-editor.js:594 |  |
| `Edit this complete script as plain text. Wrapped lines keep their original indentation without adding spaces to the source. Scenes in the outline jump to declarations within this script. A character name followed by a colon starts dialogue. Suggestions appear as you type; Up and Down choose, Enter or Tab uses one, and Ctrl+Space asks for them. Tab indents; Shift+Tab dedents. Ctrl+Shift+[ folds the block the caret is in and Ctrl+Shift+] opens it. Escape leaves the editor.` | description (aria description of the editable script) | folio-editor.js:596 |  |
| `Read-only script. Tap a passage to preview it, or select text to copy. Choose Edit script to open the keyboard and change the script.` | description (aria description while reading) | folio-editor.js:598 |  |

### Writer's bar

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Indentation` | group aria-label (Indent and Dedent pair) | app.js:2179 |  |
| `Indent` | aria-label and tooltip | app.js:2179 |  |
| `Dedent` | aria-label and tooltip | app.js:2179 |  |
| `Format script` | aria-label and tooltip | app.js:1681, app.js:2179 |  |
| `Writing tools` | aria-label and tooltip of the three-dot button | app.js:2179 |  |
| `Add` | button label and aria-label (opens the Add menu) | app.js:2179 |  |
| `Edit script` | aria-label of the phone Edit button | app.js:2179 |  |
| `Edit` | button label (phone, reading mode) | app.js:2179 |  |

### Caret readout

The readout is built as `Line ` + line number + `, Col ` + column number, followed by ` (` + n + ` selected)` when text is selected.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Line ` | label (readout prefix) | app.js:1134 |  |
| `, Col ` | label (readout between line and column) | app.js:1134 |  |
| ` (` | readout, opening the selection count | app.js:1134 |  |
| ` selected)` | readout, closing the selection count | app.js:1134 |  |

### Script right-click menu

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Script menu` | aria-label of the menu | app.js:1686 |  |
| `Cut` | menu item (with Mod+X) | app.js:1666 |  |
| `Copy` | menu item (with Mod+C) | app.js:1667 |  |
| `Paste` | menu item (with Mod+V) | app.js:1669 |  |
| `Select all` | menu item (with Mod+A) | app.js:1678 |  |
| `Rename` | menu item | app.js:1680 |  |
| `Format script` | menu item | app.js:1681, app.js:2179 |  |
| `Find references` | menu item | app.js:1683 |  |
| `Go to definition` | menu item | app.js:1684 |  |

### Context button in the bar

The middle of the bar shows one button for the thing under the caret: a color value, a link to another script, or a name with a definition. Its label is built as `Open ` + script name, `Go to ` + name, or the color value; its aria-label as `Open ` + script name, `Go to where ` + name + ` is defined`, or `Change color ` + the value.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Open ` | button label and aria-label prefix (link to another script) | app.js:1608, app.js:1615 |  |
| `Go to ` | button label prefix (name with a definition) | app.js:1609 |  |
| `Go to where ` | aria-label prefix | app.js:1616 |  |
| ` is defined` | aria-label suffix | app.js:1616 |  |
| `Change color ` | aria-label prefix (color value) | app.js:1613 |  |

### Writing tools menu

The menu opens in place of the keyboard on phones and above the bar on desktop. The three name rows appear only while the caret is on a name; `Rename ` + name, `Find references to ` + name and `Go to definition for ` + name.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Writing tools` | title (dialog heading) | folio-tools.js:204 |  |
| `Close writing tools` | aria-label of the close button | folio-tools.js:228 |  |
| `Back to writing tools` | aria-label of the back button on a view reached from the menu | folio-tools.js:228 |  |
| `Rename ` | row title prefix, followed by the name (fallback `Rename a name`) | folio-tools.js:209, folio-tools.js:243 |  |
| `Rename a name` | row title when no name is under the caret | folio-tools.js:243 |  |
| `Tap Edit to rename.` | row description while reading | folio-tools.js:243 |  |
| `Rename all uses and linked assets.` | row description | folio-tools.js:243 |  |
| `Find references to ` | row title prefix, followed by the name | folio-tools.js:244 |  |
| `Find references to a name` | row title when no name is under the caret | folio-tools.js:244 |  |
| `Show all uses and linked assets.` | row description | folio-tools.js:244 |  |
| `Go to definition for ` | row title prefix, followed by the name | folio-tools.js:245 |  |
| `Go to definition for a name` | row title when no name is under the caret | folio-tools.js:245 |  |
| `Show all linked assets.` | row description for a picture or sound | folio-tools.js:245 |  |
| `Show the ` | row description prefix: `Show the ` + kind + `.` | folio-tools.js:245 |  |
| `defined name` | kind in that description | folio-tools.js:13 |  |
| `stored value` | kind in that description | folio-tools.js:14 |  |
| `picture in your assets` | kind in that description | folio-tools.js:15 |  |
| `sound in your assets` | kind in that description | folio-tools.js:16 |  |
| `Sparkdown guide` | row title and view title | folio-tools.js:206, folio-tools.js:249 |  |
| `A quick reference while you write.` | row description | folio-tools.js:249 |  |
| `Keyboard shortcuts` | row title and view title | folio-tools.js:207, folio-tools.js:250 |  |
| `For a connected keyboard.` | row description | folio-tools.js:250 |  |
| `Search` | view title | folio-tools.js:205 |  |
| `References to ` | view title prefix, followed by the name | folio-tools.js:208 |  |
| `Rename ` | view title prefix, followed by the name | folio-tools.js:209, folio-tools.js:243 |  |
| `Change color` | view title | folio-tools.js:210 |  |

### Search and replace view

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Find` | label | folio-tools.js:74 |  |
| `Words to find` | aria-label and placeholder of the Find field | folio-tools.js:74 |  |
| `Replace` | label | folio-tools.js:74 |  |
| `Replace with` | aria-label and placeholder of the Replace field | folio-tools.js:74 |  |
| `How to match` | group aria-label of the three switches | folio-tools.js:72 |  |
| `Aa` | button label (Match case) | folio-tools.js:72 |  |
| `Match case` | aria-label and tooltip | folio-tools.js:72 |  |
| `Whole words` | aria-label and tooltip | folio-tools.js:72 |  |
| `Regular expression` | aria-label and tooltip | folio-tools.js:72 |  |
| `Previous match` | aria-label | folio-tools.js:73 |  |
| `Previous match (Shift Enter)` | tooltip | folio-tools.js:73 |  |
| `Next match` | aria-label | folio-tools.js:73 |  |
| `Next match (Enter)` | tooltip | folio-tools.js:73 |  |
| `Replace this match` | aria-label and tooltip | folio-tools.js:74 |  |
| `Replace all matches` | aria-label and tooltip | folio-tools.js:74 |  |
| `No matches in any script.` | status | folio-tools.js:106 |  |
| `No matching text in any script. Try another word.` | status | folio-tools.js:128 |  |
| `Enter words to find.` | status | folio-tools.js:128 |  |
| `Enter words to find first.` | status | folio-tools.js:151, folio-tools.js:160 |  |
| `Defined here` | tag on the declaring line in a list of uses (references) | folio-tools.js:37 |  |
| `, where it is defined` | appended to the declaring line's aria-label (`Line ` + number + `: ` + the line's text) | folio-tools.js:37 |  |
| `No script uses ` | empty references list: this text + the name (or `it`) + ` yet.` | folio-tools.js:30 |  |

### Rename view

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `New name` | label | folio-tools.js:265 |  |
| `Rename` | button | folio-tools.js:265 |  |
| `Changes ` | status prefix: `Changes ` + uses + ` in ` + scripts, then ` and renames ` + files + ` in your assets` when files change, then the sentence below | folio-tools.js:264 |  |
| `. The same word in dialogue and action stays as it is.` | status suffix | folio-tools.js:264 |  |
| ` Cues keep their capitals.` | status suffix added for a character | folio-tools.js:264 |  |

### Color view

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Pick any color` | aria-label of the color picker | folio-tools.js:298 |  |
| `Value` | label | folio-tools.js:298 |  |
| `Opacity` | label | folio-tools.js:298 |  |
| `Use color` | button | folio-tools.js:298 |  |
| `Colors in this story` | label | folio-tools.js:298 |  |
| `In this story` | label | folio-tools.js:298 |  |
| `Write a color as # and six letters or digits, such as #f2c14e.` | error message | folio-tools.js:347 |  |

### Sparkdown guide view

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Starts a scene inside this script.` | description | folio-tools.js:355 |  |
| `Starts dialogue for a character.` | description | folio-tools.js:355 |  |
| `Shows a character or expression.` | description | folio-tools.js:355 |  |
| `Changes the backdrop.` | description | folio-tools.js:355 |  |
| `Starts a choice menu.` | description | folio-tools.js:355 |  |
| `Shows the option every time.` | description | folio-tools.js:355 |  |
| `Shows the option only the first time you encounter this choice.` | description | folio-tools.js:355 |  |
| `Brings the paths back together.` | description | folio-tools.js:355 |  |

The guide's code examples, each shown above its description: `scene the_rumour`, `IMANI:`, `[[imani:happy]]`, `[[show backdrop sky_night]]`, `choose`, `+ [Your option]`, `* [Your option]`, `then … end` (folio-tools.js:355).

## Suggestions and hover cards

The suggestion list opens as you type: a panel with a preview side on desktop, a row of chips in the writer's bar's place on compact widths. Hover cards open over a picture, a color value or a script path.

### Suggestion list

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `No suggestions here.` | empty state | folio-language-ui.js:292 |  |
| `Suggestions` | aria-label of the list (panel and chip row) | folio-language-ui.js:299, folio-language-ui.js:308 |  |
| `Close suggestions` | aria-label of the chip row's close button | folio-language-ui.js:304 | compact widths only |
| `Enter or Tab adds it · Esc closes` | footer of the desktop panel | folio-language-ui.js:313 |  |
| `Backdrop` | preview caption under a picture suggestion | folio-language-ui.js:222 | or `Portrait` |
| `Portrait` | preview caption under a picture suggestion | folio-language-ui.js:222 |  |
| `Listen to ` | aria-label of a sound suggestion's play button: this text + the sound's name | folio-language-ui.js:226 |  |
| `Sound` | preview caption of a sound with no known duration | folio-language-ui.js:226 | otherwise its length as a clock |

Each suggestion's detail line:

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Included` | detail of a script the story already includes | folio-language.js:527 |  |
| `Script` | detail of any other script | folio-language.js:527 |  |
| `Branch in this scene` | detail of a branch | folio-language.js:539 |  |
| `Scene in ` | detail of a scene: this text + `Main` for main.sd, otherwise the script's name | folio-language.js:542 |  |
| `Main` | the main script's name in that detail | folio-language.js:542 |  |
| `image` | detail of a picture | folio-language.js:589 |  |
| `audio` | detail of a sound | folio-language.js:603 |  |
| `Turns it on` | detail of a switch attribute's on value | folio-language.js:561 |  |
| `Turns it off` | detail of a switch attribute's off value | folio-language.js:561 |  |
| ` · default` | appended to an attribute group's name for its default option | folio-language.js:561 |  |
| `Alternate` | detail of an `@` alternate | folio-language.js:575 |  |
| `Behind everyone` | detail of the backdrop command | folio-language.js:582, folio-language.js:594 |  |
| `A character` | detail of the portrait command | folio-language.js:582, folio-language.js:594 |  |
| `Loops until stopped` | detail of `play music` | folio-language.js:608 |  |
| `Background sound, loops` | detail of `play ambient` | folio-language.js:608 |  |
| `Plays once` | detail of any other sound command | folio-language.js:608 |  |
| `Character` | detail of a character name | folio-language.js:620 |  |

### Expression suggestions

A panel above the writer's bar that auditions a portrait's expressions before adding one. It renders on the route `folio.html#suggestions`, which no control links to.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Expression suggestions` | aria-label of the panel | app.js:2169 |  |
| `Imani · choose an expression` | heading | app.js:2169 | the demo character's name is part of the literal |
| `Cancel expression suggestion` | aria-label of the close button | app.js:2169 |  |
| `happy` | expression button label, shown with its first letter capitalised (`Happy`) | app.js:2169 | also `sad`, `angry` |
| `sad` | expression button label, shown as `Sad` | app.js:2169 |  |
| `angry` | expression button label, shown as `Angry` | app.js:2169 |  |
| `Imani, ` | alt text of an expression's picture: this text + the expression | app.js:2169 |  |
| ` ✓` | mark after the auditioned expression's label | app.js:2169 |  |
| `See it first. Add it when it feels right.` | footer caption | app.js:2169 |  |
| `Use ` | primary button: this text + the auditioned expression | app.js:2169 |  |

Rename errors raised while renaming a name in the script:

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Use letters, numbers and underscores, starting with a letter.` | error | folio-language.js:433 |  |
| `That is already its name.` | error | folio-language.js:434 |  |
| `There is already a ` | error when the new name is taken: this text, the kind (`defined name` for a definition, otherwise the symbol's kind such as `scene`), ` called `, the existing name and `.` | folio-language.js:436 |  |
| ` called ` | piece of that error | folio-language.js:436 |  |

### Hover cards

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Picture ` | aria-label of a picture's card: this text + its reference | folio-language-ui.js:48 |  |
| `Color ` | aria-label of a color's card: this text + its value | folio-language-ui.js:50 |  |
| `Link to ` | aria-label of a path's card: this text + the script's title | folio-language-ui.js:51 |  |
| `% opacity` | caption under a translucent color: the rounded percentage + this text | folio-language-ui.js:41 |  |
| `Change` | button on a color's card, opening the Change color view | folio-language-ui.js:41 |  |
| `line` | caption of a path's card: the path, ` · `, the count, a space, then this word or `lines` | folio-language-ui.js:43 |  |
| `lines` | as above, for more than one line | folio-language-ui.js:43 |  |
| `Open` | button on a path's card | folio-language-ui.js:43 |  |
| `-click the path to open it too.` | hint at the foot of a path's card, after `⌘` on Apple devices or `Ctrl` elsewhere | folio-language-ui.js:43 |  |
| `⌘` | modifier name on Apple devices | folio-language-ui.js:33 |  |
| `Ctrl` | modifier name elsewhere | folio-language-ui.js:33 |  |

## Add menu

The Add menu is a panel: a list of nine blocks, and for Backdrop, Portrait, Music and Sound a picker. Each block is a title with a one-line description.

### Blocks

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Add to script` | title (panel heading) | folio-insert.js:29 |  |
| `Add` | aria-label of the Add button | folio-insert.js:339, folio-insert.js:407 |  |
| `Close add menu` | aria-label and tooltip of the Add button while the panel is open | folio-insert.js:339, folio-insert.js:340 |  |
| `Character` | entry title | folio-insert.js:111 |  |
| `Define a new character.` | entry description | folio-insert.js:111 |  |
| `Scene` | entry title | folio-insert.js:112 |  |
| `Start a new part of the story.` | entry description | folio-insert.js:112 |  |
| `Branch` | entry title | folio-insert.js:113 |  |
| `Create a named path inside this scene.` | entry description | folio-insert.js:113 |  |
| `Choice Menu` | entry title | folio-insert.js:114 |  |
| `Present the reader with a decision.` | entry description | folio-insert.js:114 |  |
| `Dialogue` | entry title | folio-insert.js:115 |  |
| `Give a character something to say.` | entry description | folio-insert.js:115 |  |
| `Backdrop` | entry title | folio-insert.js:30, folio-insert.js:116 |  |
| `Change the location in the background.` | entry description | folio-insert.js:116 |  |
| `Portrait` | entry title | folio-insert.js:31, folio-insert.js:117 |  |
| `Show a character or expression.` | entry description | folio-insert.js:117 |  |
| `Sound` | entry title | folio-insert.js:33, folio-insert.js:118 |  |
| `Play a sound effect.` | entry description | folio-insert.js:118 |  |
| `Music` | entry title | folio-insert.js:32, folio-insert.js:119 |  |
| `Play background music.` | entry description | folio-insert.js:119 |  |
| `Add a scene or move into one to use story blocks.` | caption shown while the caret is outside a scene | folio-insert.js:404 |  |

### Pickers

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Backdrop` | picker title | folio-insert.js:30, folio-insert.js:116 |  |
| `Portrait` | picker title | folio-insert.js:31, folio-insert.js:117 |  |
| `Music` | picker title | folio-insert.js:32, folio-insert.js:119 |  |
| `Sound` | picker title | folio-insert.js:33, folio-insert.js:118 |  |
| `Back to add options` | aria-label of the back button | folio-insert.js:398 |  |
| ` options` | aria-label of the picker list: the title followed by this word | folio-insert.js:398, folio-insert.js:407 |  |
| `No ` | empty-state line: `No ` + backdrops, portraits, music or sounds + ` yet.` | folio-insert.js:406 |  |
| ` yet.` | empty-state line suffix | folio-insert.js:406 |  |
| `backdrops` | word in the empty-state line | folio-insert.js:36 |  |
| `portraits` | word in the empty-state line | folio-insert.js:37 |  |
| `music` | word in the empty-state line | folio-insert.js:38, folio-insert.js:119, folio-insert.js:391 |  |
| `sounds` | word in the empty-state line | folio-insert.js:39 |  |
| `Sounds` | first word of the empty-state hint for Music and Sound: word + ` in a folder called ` + folder name + ` are listed here.` | folio-insert.js:406 |  |
| `Pictures` | first word of the empty-state hint for Backdrop and Portrait | folio-insert.js:406 |  |
| `  in a folder called  ` | empty-state hint, middle | folio-insert.js:406 |  |
| ` are listed here.` | empty-state hint, end | folio-insert.js:406 |  |
| `Open Assets` | button (link to the Assets page) | folio-insert.js:406 |  |
| `Type a name instead` | button | folio-insert.js:406 |  |
| `Preview` | aria-label prefix of an item on desktop: `Preview ` + name, then `, ` + detail when it has one | folio-insert.js:407 |  |
| `Add` | aria-label prefix of an item on phones: `Add ` + name | folio-insert.js:339, folio-insert.js:407 |  |
| `Select to preview` | footer caption on desktop before an item is chosen (pictures) | folio-insert.js:407 |  |
| `Select to listen` | footer caption on desktop before an item is chosen (sounds) | folio-insert.js:407 |  |
| `Previewing` | footer caption while a picture is selected | folio-insert.js:407 |  |
| `Playing` | footer caption while a sound is playing | folio-insert.js:407 |  |
| `Use ` | button label: `Use ` + the lower-case picker title (backdrop, portrait, music, sound) | folio-insert.js:407 |  |
| `Browse ` | aria-label of the phone carousel controls: `Browse ` + lower-case title + ` options` | folio-insert.js:407 |  |
| `Previous ` | aria-label of the phone Previous button: `Previous ` + lower-case title + `s` | folio-insert.js:407 |  |
| `Next ` | aria-label of the phone Next button: `Next ` + lower-case title + `s` | folio-insert.js:407 |  |
| `Portrait thumbnail preferences` | aria-label and tooltip of the settings link (phone, portrait picker) | folio-insert.js:407 |  |
| `Whole image` | crop caption for the portrait thumbnails | folio-insert.js:139 |  |
| `Top` | crop caption prefix: `Top ` + percentage | folio-insert.js:140 |  |

### Text the Add menu writes into the script

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `New character` | default character name | folio-insert.js:199 |  |
| `What happens next?` | placeholder question of a new choice menu | folio-insert.js:286 |  |
| `First option` | placeholder option | folio-insert.js:109 |  |
| `Second option` | placeholder option | folio-insert.js:109 |  |
| `The first path begins here.` | placeholder line under the first option | folio-insert.js:109 |  |
| `The second path begins here.` | placeholder line under the second option | folio-insert.js:109 |  |
| `backdrop_name` | placeholder identifier in a new Backdrop line | folio-insert.js:267 |  |
| `What do they say?` | placeholder dialogue line | folio-insert.js:288 |  |
| `sound_name` | placeholder identifier in a new Sound line | folio-insert.js:292 |  |
| `music_name` | placeholder identifier in a new Music line | folio-insert.js:293 |  |

## Scripts page

The Scripts page replaces the script pane. On narrow widths it has two tabs; where the sidebar Outline is on screen the page shows the file list alone.

### Header, tabs and search

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Scripts` | aria-label of the page section | folio-scripts.js:61, folio-scripts.js:199 |  |
| `Browse scripts` | aria-label of the tab list | folio-scripts.js:63, app.js:2023 |  |
| `All scripts` | tab label (also the list panel's aria-label when there are no tabs) | folio-scripts.js:63, folio-scripts.js:387 |  |
| `In this script` | tab label | folio-scripts.js:63, folio-scripts.js:473 |  |
| `Search scripts` | aria-label and placeholder of the search field | folio-scripts.js:64, folio-scripts.js:377 |  |
| `Search outline` | aria-label and placeholder of the search field on the In this script tab | folio-scripts.js:377 |  |
| `Clear search` | aria-label of the clear button; also a button in the empty state | folio-scripts.js:64, folio-scripts.js:460 |  |
| `New` | button label (opens the New menu) | folio-scripts.js:64 |  |
| `Back to story` | button label in the page header | app.js:2023, app.js:2190, app.js:2197 |  |

### Trail

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Scripts root` | aria-label and tooltip of the root crumb button; first row of the parent-folders menu | folio-scripts.js:219, folio-scripts.js:257 |  |
| `Show parent folders` | aria-label of the ellipsis button when the trail is folded | folio-scripts.js:215 |  |
| `Folder path` | aria-label of the trail | folio-scripts.js:222 |  |
| `Destination` | aria-label of the trail in the Move dialog | folio-scripts.js:222 |  |
| `Parent folder` | aria-label and tooltip of the back button inside a folder | folio-scripts.js:344, folio-scripts.js:597 |  |
| `Results in all folders` | caption replacing the trail while searching | folio-scripts.js:344 |  |
| `Scripts` | name of the root crumb in the Move dialog trail | folio-scripts.js:61, folio-scripts.js:199 |  |

### Selection bar

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Stop selecting` | aria-label and tooltip of the close button | folio-scripts.js:314 |  |
| `Select items` | caption while nothing is picked | folio-scripts.js:314 |  |
| ` selected` | caption: the number picked + this text | folio-scripts.js:314 |  |
| `Select all` | button | folio-scripts.js:314 |  |
| `Move…` | button | folio-scripts.js:314, folio-scripts.js:829 |  |
| `Download` | button | folio-scripts.js:314, folio-scripts.js:848 |  |
| `Delete…` | button | folio-scripts.js:314, folio-scripts.js:854 |  |

### Sort menu

The sort button reads the field name, with a direction icon; its aria-label is `Sort by ` + the field in lower case + `, ` + the direction in lower case (for example the Name field with A to Z).

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Sort by` | aria-label prefix of the sort button, and heading of the first menu group | folio-files.js:99 |  |
| `Order` | heading of the second menu group | folio-files.js:102 |  |
| `Name` | sort field (menu row and button label) | folio-files.js:75 |  |
| `A to Z` | direction of Name | folio-files.js:75 |  |
| `Z to A` | direction of Name | folio-files.js:75 |  |
| `Modified` | sort field | folio-files.js:76 |  |
| `Oldest first` | direction of Modified | folio-files.js:76 |  |
| `Newest first` | direction of Modified | folio-files.js:76 |  |
| `Size` | sort field | folio-files.js:77 |  |
| `Smallest first` | direction of Size | folio-files.js:77 |  |
| `Largest first` | direction of Size | folio-files.js:77 |  |
| `Uses` | sort field | folio-files.js:78 |  |
| `Least used first` | direction of Uses | folio-files.js:78 |  |
| `Most used first` | direction of Uses | folio-files.js:78 |  |
| `Story order` | sort field (menu row) | folio-files.js:79 |  |
| `Story` | button label while sorted by Story order | folio-files.js:94 |  |
| `By first reached` | direction of Story order | folio-files.js:79 |  |
| `By last reached` | direction of Story order | folio-files.js:79 |  |

### New menu

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Script` | menu row | folio-scripts.js:518, folio-scripts.js:745 |  |
| `Folder` | menu row | folio-scripts.js:518, folio-scripts.js:746 |  |

### Rows

A row is the name with a caption beneath. A script's caption joins its parts with ` · ` in this order: `Entry script` (Main only), the folder when searching or what a folder holds, the time and size (or, when sorted by Uses, the include count), and `not included yet`. A folder's caption is what it holds, then a count followed by ` not included yet` when scripts inside are never reached.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Main` | name of the entry script row | folio-scripts.js:457 |  |
| `Entry script` | caption (Main) | folio-scripts.js:442 |  |
| `Modified ` | caption prefix: `Modified ` + age + ` · ` + size | folio-scripts.js:434 |  |
| ` ·` | caption separator | folio-scripts.js:448 |  |
| `just now` | age when under a minute (otherwise a number with m, h or d, or a date) | folio-files.js:110 |  |
| `Included by ` | caption prefix when sorted by Uses: `Included by ` + a count and the word script (with s unless the count is 1) | folio-scripts.js:438 |  |
| `not included yet` | caption on a script no script includes | folio-scripts.js:423 |  |
| ` not included yet` | caption suffix on a folder: the count of such scripts, then this text | folio-scripts.js:422 |  |
| `Empty` | caption on a folder with nothing in it | folio-scripts.js:362 |  |
| `Open folder ` | aria-label prefix of a folder row | folio-scripts.js:450 |  |
| `Open script ` | aria-label prefix of a script row | folio-scripts.js:450 |  |
| `, entry script` | aria-label suffix of the Main row | folio-scripts.js:453 |  |
| `Options for ` | aria-label of a row's menu button: `Options for ` + name | folio-scripts.js:457 |  |

### Row menu

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Select` | menu row | folio-scripts.js:821 |  |
| `Rename` | menu row | folio-scripts.js:515, folio-scripts.js:823 |  |
| `Move…` | menu row | folio-scripts.js:314, folio-scripts.js:829 |  |
| `Duplicate` | menu row | folio-scripts.js:838 |  |
| `Download` | menu row | folio-scripts.js:314, folio-scripts.js:848 |  |
| `Delete…` | menu row | folio-scripts.js:314, folio-scripts.js:854 |  |

### Empty states

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `This folder is empty` | heading | folio-scripts.js:460 |  |
| `Add a script or folder to get started.` | description | folio-scripts.js:460 |  |
| `New script` | button | folio-scripts.js:460 |  |
| `No matching scripts or folders` | heading (search) | folio-scripts.js:460 |  |
| `Try a different name or part of a path.` | description (search) | folio-scripts.js:460 |  |
| `Clear search` | button (search) | folio-scripts.js:64, folio-scripts.js:460 |  |
| `No matching scenes or blocks` | heading (In this script search) | folio-scripts.js:310 |  |
| `Try a scene name, branch name or choice question.` | description (In this script search) | folio-scripts.js:310 |  |
| `Main stays at the root of your story.` | error message | folio-files.js:204, folio-files.js:245 |  |
| `The scripts folder stays at the root of your story.` | error message | folio-files.js:205, folio-files.js:246 |  |
| `This item no longer exists.` | error message | folio-files.js:206, folio-files.js:247 |  |
| `This script no longer exists.` | error message | folio-files.js:230 |  |

## Assets

The Assets page shares the Scripts page's header, search and Add button, with a row of type tabs under the search.

### Header, tabs and search

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Assets` | aria-label of the page section; header title | folio-assets.js:160, app.js:843, app.js:2197 |  |
| `Back to story` | button label in the header | app.js:2023, app.js:2190, app.js:2197 |  |
| `Search assets` | aria-label and placeholder of the search field | folio-assets.js:162 |  |
| `Clear search` | aria-label of the clear button | folio-assets.js:162, folio-assets.js:1315 |  |
| `Add` | button label (opens the Add menu below) | folio-assets.js:162, app.js:2179 |  |
| `Collection` | aria-label of the list panel | folio-assets.js:163 |  |
| `Uploads` | aria-label of the uploads panel | folio-assets.js:164 |  |
| `Asset types` | aria-label of the type tab list | folio-assets.js:1300 |  |
| `Images` | type tab | folio-library.js:56 |  |
| `Audio` | type tab | folio-library.js:57, folio-library.js:74 |  |
| `Video` | type tab | folio-library.js:58, folio-library.js:75, folio-library.js:118 |  |
| `Text` | type tab | folio-library.js:59, folio-library.js:77 |  |
| `Fonts` | type tab | folio-library.js:60 |  |
| `Other` | type tab | folio-library.js:61 |  |

### Add menu (page)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Upload files` | menu row (also an empty-state button) | folio-assets.js:1335, folio-assets.js:2788 |  |
| `Into ` | hint under Upload files: `Into ` + folder or tab name | folio-assets.js:2790 |  |
| `Add a link` | menu row (also the dialog title) | folio-assets.js:2306, folio-assets.js:2794 |  |
| `A file hosted on the web` | hint under Add a link | folio-assets.js:2796 |  |
| `New folder` | menu row (also the dialog title) | folio-assets.js:2343, folio-assets.js:2800 |  |
| `In ` | hint under New folder: `In ` + folder or tab name | folio-assets.js:2344, folio-assets.js:2802 |  |

### Trail, sort and layout

Sorting uses the same menu as the Scripts page (see Scripts page, Sort menu). At the root of a tab the trail says the number of files with the word file.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Folder path` | aria-label of the trail | folio-assets.js:709 |  |
| `Parent folder` | aria-label and tooltip of the back button | folio-assets.js:1262, folio-assets.js:2452 |  |
| `Results in all types` | caption replacing the trail while searching | folio-assets.js:1250 |  |
| `Change how this folder is shown` | aria-label of the layout button | folio-assets.js:1292 |  |
| `Portrait tiles` | layout menu row | folio-assets.js:133 |  |
| `Landscape tiles` | layout menu row | folio-assets.js:134 |  |
| `Small tiles` | layout menu row | folio-assets.js:135 |  |
| `List` | layout menu row | folio-assets.js:136 |  |

### Row and tile captions

A caption joins its parts with ` · `: where the file is (when searching), `link` for a link, the length of a sound or video, then `Modified ` + age and the size in bytes, kB or MB; when sorted by Uses the last two are replaced by the use count. A tile shows the same parts without the length.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Modified ` | caption prefix | folio-assets.js:1173 |  |
| `link` | caption word for a link file | folio-assets.js:1152, folio-assets.js:1190, folio-assets.js:1198 |  |
| `unused` | caption when no line uses the file | folio-assets.js:1155 |  |
| `use` | caption: the count, a space, then this word, with s when the count is not 1 | folio-assets.js:1156 |  |
| `in ` | caption prefix when searching: `in ` + folder path | folio-assets.js:1160 |  |
| `Empty` | caption on a folder with nothing in it | folio-assets.js:1234 |  |
| ` variant` | caption and badge: the count + this word, with s when the count is not 1 | folio-assets.js:89 |  |
| `Open ` | aria-label prefix of an item: `Open ` + the lower-case type word + ` ` + name | folio-assets.js:1207, folio-assets.js:1227, folio-assets.js:1680 |  |
| `Play` | aria-label of a sound row's play button: `Play` or `Pause`, a space, then the name | folio-assets.js:282 |  |
| `Options for ` | aria-label of a row's menu button | folio-assets.js:1214, folio-assets.js:1227, folio-assets.js:1274 |  |
| `Image` | type word in the inspector and in the Other tab caption | folio-library.js:73 |  |
| `Audio` | type word | folio-library.js:57, folio-library.js:74 |  |
| `Video` | type word | folio-library.js:58, folio-library.js:75, folio-library.js:118 |  |
| `Font` | type word | folio-library.js:76 |  |
| `Text` | type word | folio-library.js:59, folio-library.js:77 |  |
| `Link` | type word | folio-library.js:78 |  |
| `File` | type word for any other extension | folio-assets.js:1150, folio-assets.js:1667, folio-library.js:79 |  |
| `image` | unit in a folder caption: count + unit, with s when the count is not 1 | folio-assets.js:102, folio-assets.js:124, folio-assets.js:140 |  |
| `sound` | unit in a folder caption (Audio) | folio-assets.js:103, folio-library.js:104, folio-library.js:525 |  |
| `video` | unit in a folder caption | folio-assets.js:104, folio-assets.js:126, folio-assets.js:1601 |  |
| `note` | unit in a folder caption (Text) | folio-assets.js:105 |  |
| `font` | unit in a folder caption | folio-assets.js:106, folio-assets.js:128, folio-assets.js:1603 |  |
| `file` | unit in a folder caption (Other, and the tab-root trail) | folio-assets.js:107, folio-assets.js:1236, folio-assets.js:1668 |  |
| `folder` | unit in a folder caption when it holds only folders | folio-assets.js:692, folio-assets.js:751, folio-assets.js:1141 |  |

### Selection bar

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Stop selecting` | aria-label and tooltip | folio-assets.js:1239 |  |
| `Select items` | caption while nothing is picked | folio-assets.js:1239 |  |
| ` selected` | caption | folio-assets.js:1239 |  |
| `Select all` | button | folio-assets.js:1239 |  |
| `Move…` | button | folio-assets.js:1239, folio-assets.js:2726, folio-assets.js:2764 |  |
| `Download` | button | folio-assets.js:1239, folio-assets.js:1752, folio-assets.js:1963 |  |
| `Delete…` | button | folio-assets.js:1239, folio-assets.js:1974, folio-assets.js:2734 |  |

### Row menus

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Select` | row menu and folder menu | folio-assets.js:2709, folio-assets.js:2747 |  |
| `Variants` | row menu (images with variants) | folio-assets.js:1563, folio-assets.js:2716 |  |
| `Rename…` | row menu, folder menu, file menu | folio-assets.js:1942, folio-assets.js:2721, folio-assets.js:2762 |  |
| `Move…` | row menu, folder menu | folio-assets.js:1239, folio-assets.js:2726, folio-assets.js:2764 |  |
| `Delete…` | row menu, folder menu, file menu | folio-assets.js:1239, folio-assets.js:1974, folio-assets.js:2734 |  |
| `Open` | folder menu | folio-assets.js:2745 |  |
| `Upload here…` | folder menu | folio-assets.js:2752 |  |
| `New folder inside…` | folder menu | folio-assets.js:2757 |  |
| `Replace…` | file menu (inspector Files section) | folio-assets.js:1947 |  |
| `Download` | file menu | folio-assets.js:1239, folio-assets.js:1752, folio-assets.js:1963 |  |

### Empty states

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `No images yet` | heading (Images tab) | folio-assets.js:111 |  |
| `Upload portraits and backgrounds with the Add button.` | description (Images tab) | folio-assets.js:112 |  |
| `No audio yet` | heading (Audio tab) | folio-assets.js:114 |  |
| `Upload sounds and music with the Add button.` | description (Audio tab) | folio-assets.js:114 |  |
| `No video yet` | heading (Video tab) | folio-assets.js:115 |  |
| `Upload a video with the Add button.` | description (Video tab) | folio-assets.js:115 |  |
| `No text yet` | heading (Text tab) | folio-assets.js:116 |  |
| `Upload notes with the Add button.` | description (Text tab) | folio-assets.js:116 |  |
| `No fonts yet` | heading (Fonts tab) | folio-assets.js:117 |  |
| `Upload a font with the Add button.` | description (Fonts tab) | folio-assets.js:117 |  |
| `Nothing yet` | heading (Other tab) | folio-assets.js:119 |  |
| `Files of any other type land here when you upload them.` | description (Other tab) | folio-assets.js:120 |  |
| `No matching assets` | heading (search) | folio-assets.js:1315 |  |
| `Try a different name, or a kind such as music or location.` | description (search) | folio-assets.js:1315 |  |
| `A collection of your art` | heading (project with no assets at all) | folio-assets.js:1335 |  |
| `Your portraits, backgrounds, sounds and music will appear here.` | description (project with no assets at all) | folio-assets.js:1335 |  |
| `Upload files` | button (project with no assets at all) | folio-assets.js:1335, folio-assets.js:2788 |  |
| `This folder is empty` | heading (empty folder) | folio-assets.js:1339 |  |
| `Upload into it with the Add button, or drop files on it from its parent folder.` | description (empty folder) | folio-assets.js:1339 |  |

### Inspector

The inspector opens beside the list on desktop and replaces it on phones.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Asset details` | aria-label of the inspector | folio-assets.js:1406 |  |
| `Close details` | aria-label of the close button | folio-assets.js:1752 |  |
| `Back to the collection` | aria-label of the back button on phones | folio-assets.js:1752 |  |
| `Previous and next` | group aria-label of the step buttons | folio-assets.js:1752 |  |
| `Previous: ` | aria-label and tooltip: `Previous: ` + name | folio-assets.js:1752 |  |
| `No previous item` | aria-label and tooltip when first | folio-assets.js:1752 |  |
| `Next: ` | aria-label and tooltip: `Next: ` + name | folio-assets.js:1752 |  |
| `No next item` | aria-label and tooltip when last | folio-assets.js:1752 |  |
| `Details` | section heading | folio-assets.js:1676 |  |
| `Type` | detail row name | folio-assets.js:1653 |  |
| `Used as` | detail row name | folio-assets.js:1657 |  |
| `Add menu` | detail row name | folio-assets.js:1661 |  |
| `, from the ` | detail row value: the Add menu word, this text, the folder name, then ` folder` | folio-assets.js:1662 |  |
| ` folder` | detail row value suffix | folio-assets.js:1662 |  |
| `Size` | detail row name (pixel size) | folio-assets.js:1664 |  |
| `Length` | detail row name | folio-assets.js:1665 |  |
| `File` | detail row name when one file | folio-assets.js:1150, folio-assets.js:1667, folio-library.js:79 |  |
| `Files` | detail row name when several files; also the section heading | folio-assets.js:1667, folio-assets.js:1744, folio-assets.js:3081 |  |
| `Where` | detail row name | folio-assets.js:1671 |  |
| `Assets root` | detail row value at the root | folio-assets.js:1674 |  |
| ` · link` | detail row value suffix for a link to a picture, sound or other file | folio-assets.js:1654 |  |
| `Used in ` | section heading: `Used in ` + a count and the word line (with s unless the count is 1) | folio-assets.js:1680 |  |
| `Not used yet` | section heading | folio-assets.js:1680 |  |
| `  · line  ` | use row name: the script name, this text, then the line number | folio-assets.js:1680 |  |
| `Open ` | aria-label prefix of a use row: `Open ` + script + ` at line ` + number | folio-assets.js:1207, folio-assets.js:1227, folio-assets.js:1680 |  |
| `  at line  ` | aria-label middle of a use row | folio-assets.js:1680 |  |
| `Nothing shows it yet. Copy its name into a line of the script, or insert a variant from above.` | description (unused image) | folio-assets.js:1680 |  |
| `Nothing plays it yet.` | description (unused audio or video) | folio-assets.js:1680 |  |
| `No style uses it yet.` | description (unused font) | folio-assets.js:1680 |  |
| `Nothing in the story refers to it.` | description (unused file of another type) | folio-assets.js:1680 |  |
| `Problems` | section heading | folio-assets.js:1684 |  |
| `Backdrop` | Used as value | folio-assets.js:1144, folio-assets.js:1504, folio-library.js:116 |  |
| `Portrait` | Used as value | folio-assets.js:1145, folio-assets.js:1504, folio-library.js:117 |  |
| `Video` | Used as value | folio-library.js:58, folio-library.js:75, folio-library.js:118 |  |
| `Music` | Used as value | folio-assets.js:1146, folio-library.js:87, folio-library.js:119 |  |
| `Ambience` | Used as value | folio-library.js:120 |  |
| `Sound` | Used as value | folio-assets.js:1147, folio-library.js:121 |  |
| `Style font` | Used as value | folio-library.js:122 |  |
| `Define` | Used as value | folio-library.js:123 |  |

### Variants and files (images)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Variants` | section heading | folio-assets.js:1563, folio-assets.js:2716 |  |
| `Reset` | button | folio-assets.js:1563 |  |
| `Show as` | label of the Portrait or Backdrop switch | folio-assets.js:1504 |  |
| `Portrait` | switch option | folio-assets.js:1145, folio-assets.js:1504, folio-library.js:117 |  |
| `Backdrop` | switch option | folio-assets.js:1144, folio-assets.js:1504, folio-library.js:116 |  |
| `As is` | variant value and menu row for a picture's own resting variant | folio-assets.js:1519, folio-assets.js:1526 |  |
| `Default` | menu row and hint for a group's resting option | folio-assets.js:1526, folio-assets.js:1528, folio-assets.js:1536 |  |
| `None` | menu row when no part uses the group | folio-assets.js:1538 |  |
| `Copy` | button (copies the variant tag) | folio-assets.js:1563 |  |
| `Insert at caret` | button | folio-assets.js:1563 |  |
| `Could not copy.` | toast | folio-assets.js:1867 |  |
| `Copied.` | toast | folio-assets.js:1866 |  |
| `Files` | section heading | folio-assets.js:1667, folio-assets.js:1744, folio-assets.js:3081 |  |
| `Add a layer or alternate…` | button | folio-assets.js:1744 |  |
| `A file named ` | note: this text, the picture name, `~group.option.png`, then ` adds a layer and `, the name, `@name.png`, then ` another alternate.` | folio-assets.js:1744 |  |
| `~group.option.png` | code sample in the note | folio-assets.js:1744 |  |
| `  adds a layer and  ` | note, middle | folio-assets.js:1744 |  |
| `@name.png` | code sample in the note | folio-assets.js:1744 |  |
| ` another alternate.` | note, end | folio-assets.js:1744 |  |
| `Alternate · ` | file role prefix: `Alternate · ` + the alternate's name | folio-assets.js:1708 |  |
| `Alternate · plain` | file role | folio-assets.js:1710 |  |
| `Base` | file role | folio-assets.js:1712 |  |
| `Asset name collision · also provides ` | file role: this text + the picture's name, for a second file the compiler gives the same name (`ava.v2.png` beside `ava.png`) | none | Not in the prototype. Worded as the compiler's `Asset name collision` problem, which the inspector's Problems section shows for the same file. |
| `Layer` | file role prefix (followed by its order number) | folio-assets.js:1720 | The order number is shown whenever the file has one: the number before a folder layer's name, or the number right after the `~` of a layer file beside its picture (`ava~20_face.happy.png` is `Layer 20`). The lowest number is the top layer. |
| `always shown` | file role part | folio-assets.js:1721 |  |
| `default` | file role part | folio-assets.js:1716, folio-assets.js:1722, folio-library.js:146 |  |
| `on ` | file role part: `on ` + the alternate's name | folio-assets.js:1723 |  |
| `The Midnight Jukebox` | font sample line | folio-assets.js:1623 |  |
| `Every night at midnight, the old jukebox plays a song nobody chose. ABCDEFGHIJKLM nopqrstuvwxyz 0123456789` | font sample paragraph | folio-assets.js:1623 |  |

### Media and zoom

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Zoom` | aria-label | folio-assets.js:813 |  |
| `Zoom out` | aria-label | folio-assets.js:813 |  |
| `Zoom in` | aria-label | folio-assets.js:813 |  |
| `View full size` | aria-label | folio-assets.js:1593 |  |
| `Use two fingers to move the picture` | hint | folio-assets.js:813 |  |
| `Zoom with the zoom buttons, a pinch, a double click or the plus and minus keys. Drag, move two fingers, or use the arrow keys to move. Press 0 to fit.` | aria-description | folio-assets.js:813 |  |
| `Play` | button aria-label | folio-assets.js:282 |  |
| `Pause` | button aria-label | folio-assets.js:282 |  |
| `Restart` | aria-label | folio-assets.js:1597 |  |
| `Position` | aria-label | folio-assets.js:1597 |  |
| `Loop` | aria-label | folio-assets.js:1597 |  |
| `This browser could not play the sound.` | toast | folio-assets.js:257 |  |
| `This file could not be read.` | caption | folio-assets.js:1630 |  |

### Link files

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Address` | label of the link field | folio-assets.js:1648, folio-assets.js:2307 |  |
| `https://` | placeholder of the link field | folio-assets.js:1648, folio-assets.js:2307 |  |
| `Save address` | button | folio-assets.js:1648 |  |
| `Open link` | button | folio-assets.js:1648 |  |
| `The address has no file extension the page can read, so it is not known what kind of file it is, and it is listed under Other.` | caption | folio-assets.js:1643 |  |
| `This link file is empty. Enter the address it points to.` | caption | folio-assets.js:1643 |  |
| `Link saved.` | toast | folio-assets.js:1450 |  |

### Uploads and drop notes

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Uploading ` | panel heading: `Uploading ` + done + ` of ` + total | folio-assets.js:2216 |  |
| `  of  ` | panel heading, middle | folio-assets.js:310, folio-assets.js:2216, app.js:1159 |  |
| ` added,` | panel heading when some failed: count + the word file (with s unless the count is 1) + this + a count + ` not added` | folio-assets.js:2218 |  |
| ` not added` | panel heading when some failed | folio-assets.js:2218 |  |
| ` added` | panel heading when all landed: count + the word file (with s unless the count is 1) + this word | folio-assets.js:2219 |  |
| `Close uploads` | aria-label | folio-assets.js:2221 |  |
| `Waiting` | row note | folio-assets.js:2246 |  |
| `Reading` | row note | folio-assets.js:2255 |  |
| `Added to ` | row note: `Added to ` + folder or tab name | folio-assets.js:2270 |  |
| `Drop to add to ` | drop note on the Assets page: this text + folder or tab name | folio-assets.js:3104 |  |
| `Files` | drop note name when the target is the type root | folio-assets.js:1667, folio-assets.js:1744, folio-assets.js:3081 |  |
| `Drop to add to Assets` | drop note anywhere else on the page | app.js:3527 |  |
| `Drop to replace this project` | drop note for a single .zip | app.js:3527 |  |
| `Each file goes to the folder of its type.` | drop note detail | app.js:3530 |  |
| `A backup replaces every script and asset, after asking.` | drop note detail for a .zip | app.js:3529 |  |

## Preview

The preview sits beside the script on desktop and tablet and expands from the phone strip on phones. It has a toolbar above the game, the game, and a bar under the game.

### Toolbar above the game

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Game preview and playback` | aria-label of the preview panel | folio-playback.js:583 |  |
| `Playback controls` | aria-label of the toolbar | folio-playback.js:583 |  |
| `Viewing mode` | aria-label and tooltip of the viewing-mode button; aria-label of its menu | folio-playback.js:576 |  |
| `Pause` | aria-label and tooltip (shown while playing) | folio-playback.js:584, folio-playback.js:988 |  |
| `Resume` | aria-label while paused | folio-playback.js:988 |  |
| `Step Into` | aria-label and tooltip text | folio-playback.js:585 |  |
| `Skip back` | aria-label | folio-playback.js:585 |  |
| `Play From Here` | aria-label of the circular play button | folio-playback.js:585, folio-playback.js:960 |  |
| `Stop` | aria-label of the play button while playing | folio-playback.js:960 |  |
| `Skip forward` | aria-label | folio-playback.js:585 |  |
| `Step Out` | aria-label | folio-playback.js:585 |  |
| `Preview settings` | aria-label and tooltip of the cog button; aria-label of its menu | folio-playback.js:580 |  |
| `Fullscreen preview` | aria-label and tooltip of the expand button | folio-playback.js:587, folio-playback.js:1020 |  |
| `Exit fullscreen preview` | aria-label and tooltip while expanded on desktop | folio-playback.js:1019 |  |
| `Close the preview` | aria-label and tooltip while expanded on phones | folio-playback.js:1018 |  |

### Tooltips of the transport buttons

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Stop and return to the editor cursor` | tooltip of Stop | folio-playback.js:966 |  |
| `Play from the selected beat` | tooltip of Play From Here | folio-playback.js:967 |  |
| `Previous played beat` | tooltip of Skip back while playing | folio-playback.js:975 |  |
| `No earlier played beat` | tooltip of Skip back when there is none | folio-playback.js:976 |  |
| `Previous beat in script` | tooltip of Skip back while stopped | folio-playback.js:977 |  |
| `Next played beat` | tooltip of Skip forward while playing | folio-playback.js:980 |  |
| `No later played beat. Continue the story to play more.` | tooltip of Skip forward when there is none | folio-playback.js:981 |  |
| `Next beat in script` | tooltip of Skip forward while stopped | folio-playback.js:982 |  |
| `Pause the story while it plays` | tooltip of Pause while stopped | folio-playback.js:990 |  |
| `Resume the story` | tooltip of Resume | folio-playback.js:992 |  |
| `Pause the story where it is` | tooltip of Pause while playing | folio-playback.js:993 |  |
| `Step through the story one beat at a time while it is paused` | tooltip of Step Into while stopped | folio-playback.js:998 |  |
| `Play the next beat and pause again` | tooltip of Step Into while paused | folio-playback.js:1000 |  |
| `Make the choice, or skip to the latest beat, to step on` | tooltip of Step Into when a choice waits | folio-playback.js:1002 |  |
| `Pause the story to step through it` | tooltip of Step Into while playing | folio-playback.js:1003 |  |
| `Step Out returns from a function call. Nothing is calling, so there is nothing to step out of.` | tooltip of Step Out | folio-playback.js:1006 |  |

### Viewing-mode menu

Each row has the mode's icon, its name above its description, and a check on the current one.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Visual Novel` | menu item name | folio-playback.js:360 |  |
| `Play your game as a series of dialogue boxes and choice menus` | menu item description | folio-playback.js:361 |  |
| `Interactive Fiction` | menu item name | folio-playback.js:365 |  |
| `Play your game as a stream of text and choices` | menu item description | folio-playback.js:366 |  |
| `Screenplay` | menu item name | folio-playback.js:368 |  |
| `Read your story as text on a printed page` | menu item description | folio-playback.js:368 |  |

### Cog menu

The cog menu lists the quick toggles for the mode on screen as checkbox rows (a name above its description), then a link to the full settings. Visual Novel lists the first three, Interactive Fiction the first only, Screenplay the last only. The names and descriptions are the Settings rows of the same name (see Settings, Preview).

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Game preview follows cursor` | menu item name (Visual Novel and Interactive Fiction) | folio-themes.js:72 |  |
| `The game shows the line the caret is on.` | menu item description | folio-themes.js:72 |  |
| `Show idle animations` | menu item name (Visual Novel) | folio-themes.js:74 |  |
| `Portraits, ui, and text with idle motion keep moving in the preview. Otherwise, they are shown in their resting state.` | menu item description | folio-themes.js:74 |  |
| `Color typing pauses` | menu item name (Visual Novel) | folio-themes.js:75 |  |
| `Mark the pauses and beeps of the typewriter while the game plays, to tune its timing.` | menu item description | folio-themes.js:75 |  |
| `Sync screenplay and editor scroll position` | menu item name (Screenplay) | folio-themes.js:73 |  |
| `The screenplay preview scrolls to show the same line visible in the script editor.` | menu item description | folio-themes.js:73 |  |
| `More preview settings` | menu item (link to Settings, Preview) | folio-playback.js:683 |  |

### Bar under the game

The bar holds the problems toggle at the left, the position readout in the middle, then the mode's display control and the fullscreen button. A thin divider above it resizes the game and the panel.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Resize game and panel` | aria-label of the divider | folio-console.js:178 |  |
| `Drag to resize. Up/Down adjust; Enter or double-click resets.` | tooltip of the divider | folio-console.js:178 |  |
| `Problems and playback messages` | aria-label of the panel and of the message log | folio-console.js:178 |  |
| `Open the panel` | tooltip of the problems toggle | folio-console.js:178 |  |
| `Collapse` | tooltip of the problems toggle when open: this word + ` the panel` | folio-console.js:362 |  |
| ` the panel` | tooltip of the problems toggle, suffix | folio-console.js:362 |  |
| `No problems` | label of the problems toggle when empty; with problems it reads the count and the word problem, with s when not 1 | folio-console.js:178, folio-console.js:367 |  |
| `problem` | word in that label | folio-console.js:188, folio-console.js:367 |  |

### Aspect-ratio picker

The picker opens upward from the button at the right of the bar. Each row is a name and a hint; the source holds them as one string split on ` · `.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Game aspect ratio` | aria-label and tooltip of the button; aria-label of the menu | folio-playback.js:570 |  |
| `Auto` | button label while Auto is chosen | folio-playback.js:570, folio-playback.js:615 |  |
| `Auto · fill pane` | row (name `Auto`, hint `fill pane`) | folio-playback.js:338 |  |
| `16:9 · Landscape` | row (name `16:9`, hint `Landscape`) | folio-playback.js:339 |  |
| `4:3 · Landscape` | row | folio-playback.js:340 |  |
| `1:1 · Square` | row | folio-playback.js:341 |  |
| `3:4 · Portrait` | row | folio-playback.js:342 |  |
| `9:16 · Portrait` | row | folio-playback.js:343 |  |
| `Game aspect ratio: ` | aria-label of the phone monitor: this text, the ratio, ` shown at ` and a scale | folio-playback.js:623 |  |

### Screenplay mode bar

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Screenplay settings` | aria-label and tooltip of the paper-size link (Screenplay mode) | folio-playback.js:570 |  |
| `US Letter` | label of that link (the paper size) | folio-playback.js:570, folio-playback.js:833 |  |

### States and placeholders

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Stopped on an error` | badge over the game | folio-playback.js:925, folio-playback.js:1027 |  |
| `End of preview` | badge over the game | folio-playback.js:927, folio-playback.js:1027 |  |
| `End of this preview` | end line of a preview | folio-playback.js:110 |  |
| `End of this script preview` | end line of a script preview | folio-playback.js:164, folio-playback.js:226 |  |
| `The next script is outside this prepared playback.` | end line detail | folio-playback.js:165, folio-playback.js:227 |  |
| `Choice selected` | label | folio-playback.js:211 |  |
| `Choices` | label | folio-playback.js:900 |  |
| `Playback started` | log message | folio-playback.js:1042 |  |
| `Playback stopped` | log message | folio-playback.js:1059 |  |
| `preview position` | label | folio-playback.js:1088 |  |
| `Fullscreen game preview` | aria-label | folio-playback.js:1092 |  |
| `Your game will appear here` | heading of the placeholder in an empty script | app.js:723 |  |
| `Start writing and see the result.` | placeholder description in an empty script | app.js:726 |  |
| `Game Preview` | placeholder heading | app.js:724, app.js:817 |  |
| `Click a line to preview it.` | placeholder description | app.js:727, app.js:817 |  |
| `Previewing` | caption | app.js:790 |  |
| `Write a line and it appears here.` | phone strip line in an empty script | app.js:2386 |  |
| `This line sets up your story.` | phone strip line on a setup line | app.js:2391 |  |
| `YOUR GAME` | phone strip name in an empty script | app.js:765 |  |
| `STORY SETUP` | phone strip name on a setup line | app.js:767 |  |
| `Miniature scene monitor` | title of the phone strip's game frame | app.js:827 |  |
| `Play from this line` | aria-label of the phone strip's play button | app.js:827 |  |
| ` game preview` | title of the game frame: the story title, then this text | app.js:373 |  |

## Problems panel

The panel opens from the problems toggle in the bar under the game. It has a row of three filter toggles and two cards, one for the script and one for the played messages.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Show or hide each kind` | group aria-label of the toggles | folio-console.js:178 |  |
| `Errors` | filter label (also the lower-case word error in each toggle's text) | folio-console.js:8 |  |
| `Warnings` | filter label | folio-console.js:8 |  |
| `Notes` | filter label | folio-console.js:8 |  |
| `error` | word in a toggle's text: count + word, with s when not 1 | folio-console.js:7, folio-console.js:9, folio-console.js:33 |  |
| `warning` | word in a toggle's text | folio-console.js:7, folio-console.js:9, folio-console.js:35 |  |
| `note` | word in a toggle's text | folio-console.js:9, folio-console.js:189 |  |
| `Hide` | tooltip prefix of an enabled toggle: `Hide ` + word + `s`; its aria-label is the text, a full stop, then this tooltip | folio-console.js:380 |  |
| `Show` | tooltip prefix of a disabled toggle: `Show ` + word + `s` | folio-console.js:380 |  |
| `In the script` | card title | folio-console.js:405 |  |
| `While playing` | card title | folio-console.js:411 |  |
| `problem` | card count word: `(` + count + the word problem (with s unless the count is 1) + ` · ` + count + the word note (with s unless the count is 1) + `)` | folio-console.js:188, folio-console.js:367 |  |
| `Clear the played messages` | aria-label and tooltip of the Clear button | folio-console.js:399 |  |
| `Copy the played messages` | aria-label and tooltip of the Copy button | folio-console.js:399 |  |
| `Save the played messages as a text file` | aria-label and tooltip of the Save button | folio-console.js:399 |  |
| `No problems.` | empty state of the script card | folio-console.js:340 |  |
| `Every kind is hidden. Turn one on above.` | empty state when all toggles are off | folio-console.js:340, folio-console.js:345 |  |
| `Nothing yet. Play the story and logs will appear here.` | empty state of the played card | folio-console.js:345 |  |
| `Error · ` | entry prefix before the title | folio-console.js:34, folio-console.js:334 |  |
| `Warning · ` | entry prefix before the title | folio-console.js:36, folio-console.js:336 |  |
| `Note · ` | entry prefix before the title (script card) | folio-console.js:37 |  |
| `Line ` | entry link: `Line ` + number, with an arrow | folio-console.js:48 |  |
| `Fixes for ` | aria-label of an entry's Fix button: `Fixes for ` + title | folio-console.js:48 |  |
| `Fix` | button label of an entry's Fix menu | folio-problems.js:67 |  |
| `Problems to fix` | dialog title when a badge or count is opened | app.js:1944 |  |
| `Copied` | toast prefix: `Copied ` + count and the word message (with s unless the count is 1) and a full stop | folio-console.js:449 | see Toasts |

### Diagnostics the prototype raises

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `To do` | title of a note raised by a comment starting with todo | folio-project.js:121 |  |
| `Remove the note` | fix menu row | folio-project.js:121 |  |
| `Note removed.` | toast after the fix | folio-project.js:121 |  |
| `Unexpected two dots` | title of an error | folio-project.js:125 |  |
| `Remove the two dots at the start of this line to make it action text.` | message | folio-project.js:125 |  |
| `Remove the two dots` | fix menu row | folio-project.js:125 |  |
| `Two dots removed.` | toast after the fix | folio-project.js:125 |  |
| `Sound not found` | title of a warning | folio-project.js:127 |  |
| `sfx_jukebox_coin_clink is not in your assets yet. Add the sound or choose one you already have.` | message | folio-project.js:127 |  |
| `Add sfx_jukebox_coin_clink to assets` | fix menu row | folio-project.js:128 |  |
| `Use sfx_door_chime instead` | fix menu row | folio-project.js:129 |  |
| `Changed to sfx_door_chime.` | toast after the fix | folio-project.js:129 |  |

## Share cards

The Share page is a heading block with Back to story, then four cards. Each card has an icon, a title, a description and a tag.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Share your story` | page heading | app.js:2201 |  |
| `Download, Collaborate & Publish` | eyebrow above the heading | app.js:2202 |  |
| `Export a shareable game or screenplay. Collaborate with others. Publish it online.` | page description | app.js:2203 |  |
| `Back to story` | button | app.js:2023, app.js:2190, app.js:2197 |  |
| `Export a game` | card title | app.js:2207 |  |
| `Package your game for Web, Desktop, or Mobile.` | card description | app.js:2208 |  |
| `Export a screenplay` | card title | app.js:2213 |  |
| `Print your story to PDF or HTML.` | card description | app.js:2214 |  |
| `Screenplay settings` | link on the Export a screenplay card (opens Settings, Screenplay) | app.js:2216 |  |
| `Make it together` | card title | app.js:2220 |  |
| `Invite someone to collaborate with you.` | card description | app.js:2221 |  |
| `Publish it online` | card title | app.js:2226 |  |
| `Create a playable link you can share with others.` | card description | app.js:2227 |  |
| `Coming soon` | tag on every card | app.js:2209, app.js:2215, app.js:2222, app.js:2228 |  |

The Export a screenplay card also shows one summary line: the paper size, then `Title page` or `No title page`, then the scene-number wording, joined with ` · `. The wordings are `No scene numbers`, `Scene numbers on the left`, `Scene numbers on the right` and `Scene numbers on both sides`, and the paper sizes `US Letter` and `A4` (folio-settings.js).

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Title page` | summary part | folio-settings.js:254, folio-settings.js:430 |  |
| `No title page` | summary part | folio-settings.js:254 |  |
| `No scene numbers` | summary part | folio-settings.js:247 |  |
| `Scene numbers on the left` | summary part | folio-settings.js:248 |  |
| `Scene numbers on the right` | summary part | folio-settings.js:249 |  |
| `Scene numbers on both sides` | summary part | folio-settings.js:250 |  |
| `US Letter` | paper size | folio-settings.js:216 |  |
| `A4` | paper size | folio-settings.js:217 |  |

## Settings

The Settings page has two halves, Editor preferences and Project preferences, and a prototype-only block at the end. On desktop the rail shows the index; on narrower widths a row of chips does. A section with a Reset to defaults button shows it only while a value differs from the usual one.

### Page and index

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Settings` | page heading and rail heading | app.js:2297, app.js:3577 |  |
| `Editor & Project Preferences` | eyebrow above the heading | app.js:2298 |  |
| `Customize the look and behavior of the editor and adjust your project settings.` | page description | app.js:2299 |  |
| `Settings sections` | aria-label of the index and of the chip row | folio-settings.js:606, folio-settings.js:610 |  |
| `Reset to defaults` | button beside a section heading | folio-settings.js:25 |  |
| `Editor preferences` | half heading and index entry | folio-settings.js:580 |  |
| `Appearance` | section heading and index entry | folio-settings.js:582 |  |
| `Script editor` | section heading and index entry | folio-settings.js:583 |  |
| `Keyboard shortcuts` | section heading and index entry | folio-settings.js:584 |  |
| `Preview` | section heading and index entry | folio-settings.js:508, folio-settings.js:585 |  |
| `Project preferences` | half heading and index entry | folio-settings.js:590 |  |
| `Metadata` | index entry for the project metadata section | folio-settings.js:592 |  |
| `Screenplay` | section heading and index entry | folio-settings.js:420, folio-settings.js:593 |  |
| `Add menu` | section heading and index entry | folio-settings.js:594 |  |
| `File types` | section heading and index entry | folio-settings.js:328, folio-settings.js:595 |  |
| `Save & sync` | section heading and index entry | folio-settings.js:596 |  |
| `Prototype review` | heading of the prototype-only block and its index entry | folio-settings.js:599 |  |

### Appearance

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Theme` | group legend | folio-themes.js:186 |  |
| `Automatic` | theme name | folio-themes.js:5 |  |
| `Charcoal or Chalk, following your device` | theme description | folio-themes.js:5 |  |
| `Charcoal` | theme name | folio-themes.js:6 |  |
| `Neutral grey · peach accents` | theme description | folio-themes.js:6 |  |
| `Chalk` | theme name | folio-themes.js:7 |  |
| `Neutral white · terracotta accents` | theme description | folio-themes.js:7 |  |
| `Ink` | theme name | folio-themes.js:8 |  |
| `Warm charcoal · peach accents` | theme description | folio-themes.js:8 |  |
| `Sepia` | theme name (the id stays paper) | folio-themes.js:11 |  |
| `Warm cream · terracotta accents` | theme description | folio-themes.js:11 |  |
| `Graphite` | theme name | folio-themes.js:12 |  |
| `Neutral charcoal · clay accents` | theme description | folio-themes.js:12 |  |
| `Warm Folio` | theme name | folio-themes.js:13 |  |
| `Soft brown · peach accents` | theme description | folio-themes.js:13 |  |
| `Midnight` | theme name | folio-themes.js:14 |  |
| `Original Spark Engine colors` | theme description | folio-themes.js:14 |  |
| `Dusk` | theme name | folio-themes.js:15 |  |
| `Quieter navy · original syntax` | theme description | folio-themes.js:15 |  |
| `Follows your device’s light or dark setting. Right now that is ` | note under the grid while Automatic is chosen: this text + the resolved theme name + a full stop | folio-themes.js:98 |  |
| `Warm charcoal, with every syntax color at its own hue and the writer’s words as the brightest tier. Speaker cues use the accent color.` | note under the grid (Ink) | folio-themes.js:18 |  |
| `The default dark theme. Ink’s syntax colors and accent on neutral charcoal.` | note under the grid (Charcoal) | folio-themes.js:19 |  |
| `The default light theme. Sepia’s syntax colors and accent on neutral white.` | note under the grid (Chalk) | folio-themes.js:20 |  |
| `Warm cream, with every syntax color keeping its hue, darkened to read at the same contrast as the dark themes. Speaker cues use the accent color.` | note under the grid (Sepia) | folio-themes.js:21 |  |
| `The original engine’s navy surfaces and syntax colors. Your other themes keep their settings.` | note under the grid (Midnight) | folio-themes.js:22 |  |
| `Midnight with slightly quieter navy backgrounds. The same white text, soft blue accent and original syntax colors.` | note under the grid (Dusk) | folio-themes.js:23 |  |
| `Surfaces` | row name (Graphite and Warm Folio only) | folio-themes.js:182 |  |
| `Unified` | option | folio-themes.js:182 |  |
| `One background for navigation, writing and preview.` | option description | folio-themes.js:182 |  |
| `Lighter navigation` | option | folio-themes.js:182 |  |
| `Darker writing and preview panes, lighter navigation.` | option description | folio-themes.js:182 |  |
| `Syntax colors` | row name (Graphite and Warm Folio only) | folio-themes.js:183 |  |
| `Original` | option | folio-themes.js:183 |  |
| `Exact colors from impower.dev.` | option description | folio-themes.js:183 |  |
| `Softened` | option | folio-themes.js:183 |  |
| `20% less color intensity. Same distinctions.` | option description | folio-themes.js:183 |  |
| ` theme applied.` | status after a preset theme is chosen: the theme name + this text | folio-themes.js:231 |  |
| ` colors applied.` | status after a custom theme is chosen, ending the sentence | folio-themes.js:231 |  |
| `unified surfaces` | status piece | folio-themes.js:231 |  |
| `lighter navigation` | status piece | folio-themes.js:231 |  |

### Script editor

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Script appearance` | group legend | folio-themes.js:193 |  |
| `Bold declaration names` | row name | folio-themes.js:59 |  |
| `Show names bolded when declaring them.` | row description | folio-themes.js:59 |  |
| `Bold speaker names` | row name | folio-themes.js:60 |  |
| `Show speaker cues bolded.` | row description | folio-themes.js:60 |  |
| `Bold container names` | row name | folio-themes.js:61 |  |
| `Show container names bolded inside of construct declarations.` | row description | folio-themes.js:61 |  |
| `Tinted dialogue` | row name | folio-themes.js:62 |  |
| `Tint dialogue to distinguish it from action text.` | row description | folio-themes.js:62 |  |
| `Italic comments` | row name | folio-themes.js:63 |  |
| `Italicize all comments.` | row description | folio-themes.js:63 |  |
| `Emphasize markup` | row name | folio-themes.js:65 |  |
| `the way the reader will see them.` | row description ending; it begins with Show, then italic, bold and underline samples with their marks | folio-themes.js:65 |  |
| `Highlight matching symbols` | row name | folio-themes.js:66 |  |
| `When the caret is on a scene, branch, character or asset name, light up its other uses in the script.` | row description | folio-themes.js:66 |  |
| `Hover previews` | row name | folio-themes.js:68 |  |
| `When hovering over an image name, show a popup preview of the image.` | row description | folio-themes.js:68 |  |
| `Show indentation guides` | row name | folio-themes.js:81 |  |
| `Show a line beside each indented block. Current block shows only the line for the block the caret is in; All levels shows the line for every block and highlights the line for the current block.` | row description | folio-themes.js:81 |  |
| `Off` | option | folio-themes.js:53 |  |
| `Current block` | option | folio-themes.js:53 |  |
| `All levels` | option | folio-themes.js:53 |  |
| `Try it on the page` | group legend | folio-themes.js:194 |  |
| `Sample ` | label of the sample menu | folio-themes.js:175 |  |
| `Dialogue` | sample option | folio-themes.js:175 |  |
| `Choices & branches` | sample option | folio-themes.js:175 |  |
| `Syntax showcase` | sample option | folio-themes.js:175 |  |
| `Read-only syntax sample` | aria-label of the sample | folio-themes.js:175 |  |
| `Syntax color key` | disclosure summary under the sample, and the key's aria-label | folio-themes.js:175 |  |
| `Action` | key entry | folio-themes.js:175 |  |
| `Dialogue / strings` | key entry | folio-themes.js:175 |  |
| `Control words` | key entry | folio-themes.js:175 |  |
| `Scene / branch targets` | key entry | folio-themes.js:175 |  |
| `Syntax / declarations` | key entry | folio-themes.js:175 |  |
| `Speakers / types` | key entry | folio-themes.js:175 |  |
| `Assets / attributes` | key entry | folio-themes.js:175 |  |
| `Variables / properties` | key entry | folio-themes.js:175 |  |
| `Numbers / units` | key entry | folio-themes.js:175 |  |
| `Functions / events` | key entry | folio-themes.js:175 |  |
| `Comments` | key entry | folio-themes.js:175 |  |
| `Operators / punctuation` | key entry | folio-themes.js:175 |  |
| `Regex / scene headings` | key entry | folio-themes.js:175 |  |
| `Escapes / directions` | key entry | folio-themes.js:175 |  |
| `Transitions` | key entry | folio-themes.js:175 |  |
| `UI elements / type keyword` | key entry | folio-themes.js:175 |  |
| `UI containers` | key entry | folio-themes.js:175 |  |
| `A caret sits on a name, so the indentation guides and Highlight matching names show. Point at a portrait for a hover preview.` | caption | folio-themes.js:175 |  |
| `Editing assistance` | group legend | folio-themes.js:195 |  |
| `Suggest autocompletions` | row name | folio-themes.js:67 |  |
| `Suggestions for names and keywords appear as you type them.` | row description | folio-themes.js:67 |  |
| `Auto-rename asset files` | row name | folio-themes.js:69 |  |
| `Renaming an asset reference in the script renames all linked asset files too.` | row description | folio-themes.js:69 |  |
| `Auto-close angle brackets` | row name | folio-themes.js:70 |  |
| `Typing < automatically closes it with >.` | row description | folio-themes.js:70 |  |
| `Auto-convert Ink syntax when formatting` | row name | folio-themes.js:71 |  |
| `Automatically rewrite Ink syntax to equivalent Sparkdown syntax when formatting.` | row description | folio-themes.js:71 |  |

### Keyboard shortcuts

Each row shows its keys as a chip. Pressing the chip records the next keys.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Change which keys trigger what actions.` | section description | folio-shortcuts.js:182 |  |
| `Editing shortcuts` | group legend | folio-shortcuts.js:19 |  |
| `Undo` | row name | folio-shortcuts.js:21, folio-shortcuts.js:313 |  |
| `Undo the last change.` | row description | folio-shortcuts.js:21 |  |
| `Redo` | row name | folio-shortcuts.js:22, folio-shortcuts.js:314 |  |
| `Redo the last change you undid.` | row description | folio-shortcuts.js:22 |  |
| `Format script` | row name | folio-shortcuts.js:23, folio-shortcuts.js:323 |  |
| `Tidy the whole script.` | row description | folio-shortcuts.js:23 |  |
| `Rename` | row name | folio-shortcuts.js:24, folio-shortcuts.js:320 |  |
| `Rename something everywhere it is used.` | row description | folio-shortcuts.js:24 |  |
| `Show suggestions` | row name | folio-shortcuts.js:25, folio-shortcuts.js:317 |  |
| `Show suggestions for possible names and keywords.` | row description | folio-shortcuts.js:25 |  |
| `Navigation shortcuts` | group legend | folio-shortcuts.js:29 |  |
| `Fold a block` | row name | folio-shortcuts.js:31 |  |
| `Fold the current block.` | row description | folio-shortcuts.js:31 |  |
| `Open a folded block` | row name | folio-shortcuts.js:32, folio-shortcuts.js:322 |  |
| `Open the current block.` | row description | folio-shortcuts.js:32 |  |
| `Search` | row name | folio-shortcuts.js:33, folio-shortcuts.js:324 |  |
| `Find text in the script, and replace it.` | row description | folio-shortcuts.js:33 |  |
| `Go to definition` | row name | folio-shortcuts.js:34, folio-shortcuts.js:318 |  |
| `Jump to where a name is declared.` | row description | folio-shortcuts.js:34 |  |
| `Find references` | row name | folio-shortcuts.js:35, folio-shortcuts.js:319 |  |
| `List every use of a name.` | row description | folio-shortcuts.js:35 |  |
| `None` | chip text when a shortcut is removed | folio-shortcuts.js:175, folio-shortcuts.js:212, folio-shortcuts.js:310 |  |
| `Press keys…` | chip text while recording | folio-shortcuts.js:238 |  |
| `  shortcut:  ` | chip aria-label: the row name, this text, the keys or none, then `. Press to change.` | folio-shortcuts.js:197 |  |
| `. Press to change.` | chip aria-label, end | folio-shortcuts.js:197 |  |
| `Press the keys for ` | chip aria-label while recording: this text + the name + the sentence below | folio-shortcuts.js:239 |  |
| `. Backspace takes the shortcut away; Esc keeps it.` | chip aria-label while recording, end | folio-shortcuts.js:239 |  |
| ` has no shortcut now.` | status | folio-shortcuts.js:266, folio-shortcuts.js:299 |  |
| `Hold Ctrl or Alt with the key, or use a function key.` | status | folio-shortcuts.js:272 |  |
| `. It was ` | status when the keys belonged to another action: the row name, `: `, the keys, this text, the other action's name, then the text below | folio-shortcuts.js:283 |  |
| `'s, which has no shortcut now.` | end of that status | folio-shortcuts.js:283 |  |

The Keyboard shortcuts sheet under Writing tools lists the rows above with the keys each answers to now, plus these fixed rows (folio-shortcuts.js:312-327):

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Indent` | sheet row | folio-shortcuts.js:315 | keys `Tab` |
| `Tab` | keys of Indent | folio-shortcuts.js:315 |  |
| `Dedent` | sheet row | folio-shortcuts.js:316 | keys `Shift Tab` |
| `Shift Tab` | keys of Dedent | folio-shortcuts.js:316 |  |
| ` click` | appended to Go to definition's keys after `⌘` or `Ctrl` | folio-shortcuts.js:318 |  |
| `Fold the block` | sheet row (the Settings row says `Fold a block`) | folio-shortcuts.js:321 |  |
| `Next or previous match` | sheet row | folio-shortcuts.js:325 |  |
| `Enter · Shift Enter, in Search` | keys of that row | folio-shortcuts.js:325 |  |
| `Leave the editor` | sheet row | folio-shortcuts.js:326 | keys `Esc` |
| `Esc` | keys of Leave the editor | folio-shortcuts.js:326 |  |

### Preview

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Screenplay paper color` | row name | folio-settings.js:517 |  |
| `Paper` | option | folio-settings.js:520 |  |
| `Black ink on a white page.` | option description | folio-settings.js:520 |  |
| `Match my theme` | option | folio-settings.js:521 |  |
| `The colors of your writing page.` | option description | folio-settings.js:521 |  |
| `Screenplay paper texture` | row name | folio-settings.js:528 |  |
| `Display a faint paper grain.` | row description | folio-settings.js:529 |  |
| `Game preview follows cursor` | row name | folio-themes.js:72 |  |
| `The game shows the line the caret is on.` | row description | folio-themes.js:72 |  |
| `Show idle animations` | row name | folio-themes.js:74 |  |
| `Portraits, ui, and text with idle motion keep moving in the preview. Otherwise, they are shown in their resting state.` | row description | folio-themes.js:74 |  |
| `Color typing pauses` | row name | folio-themes.js:75 |  |
| `Mark the pauses and beeps of the typewriter while the game plays, to tune its timing.` | row description | folio-themes.js:75 |  |
| `Sync screenplay and editor scroll position` | row name | folio-themes.js:73 |  |
| `The screenplay preview scrolls to show the same line visible in the script editor.` | row description | folio-themes.js:73 |  |
| `Screenplay page: ` | status: this text + the option name | folio-settings.js:543 |  |
| `Paper texture ` | status: this text + on or off | folio-settings.js:551 |  |

### Project metadata

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Project metadata` | section heading | app.js:2310 |  |
| `Written in a front matter block at the top of Main.` | section description | app.js:2310 |  |
| `Edit in Main` | button | app.js:2310 |  |
| `Title` | row name | app.js:2311 |  |
| `Author` | row name | app.js:2311 |  |
| `Not set` | value when there is no author | app.js:2311 |  |

### Screenplay

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Screenplay` | section heading | folio-settings.js:420, folio-settings.js:593 |  |
| `How your story looks when previewing or exporting it as a screenplay.` | section description | folio-settings.js:423 |  |
| `Show preview` | button beside the heading | folio-settings.js:424 |  |
| `Printed when previewing or exporting` | group legend | folio-settings.js:427 |  |
| `These settings affect the appearance of the screenplay when previewing or exporting it.` | group note | folio-settings.js:428 |  |
| `Title page` | row name | folio-settings.js:254, folio-settings.js:430 |  |
| `Print a title page for the screenplay.` | row description | folio-settings.js:430 |  |
| `Bold headings` | row name | folio-settings.js:431 |  |
| `Print headings in bold.` | row description | folio-settings.js:431 |  |
| `Heading numbers` | row name | folio-settings.js:432 |  |
| `Number each heading in the margin, like a shooting script does.` | row description | folio-settings.js:432 |  |
| `None` | option of Heading numbers | folio-settings.js:210 |  |
| `Left margin` | option of Heading numbers | folio-settings.js:211 |  |
| `Right margin` | option of Heading numbers | folio-settings.js:212 |  |
| `Both margins` | option of Heading numbers | folio-settings.js:213 |  |
| `Scene names` | row name | folio-settings.js:433 |  |
| `Print scene names where they are declared.` | row description | folio-settings.js:433 |  |
| `Branch names` | row name | folio-settings.js:434 |  |
| `Print branch names where they are declared.` | row description | folio-settings.js:434 |  |
| `Function names` | row name | folio-settings.js:435 |  |
| `Print function names where they are declared.` | row description | folio-settings.js:435 |  |
| `Printed when exporting to PDF` | group legend | folio-settings.js:440 |  |
| `These settings do not affect the in-engine preview.` | group note | folio-settings.js:441 |  |
| `Paper size` | row name | folio-settings.js:444 |  |
| `The size of the paper to print to.` | row description | folio-settings.js:444 |  |
| `Page numbers` | row name | folio-settings.js:445 |  |
| `Print the current page number in the bottom corner of each page.` | row description | folio-settings.js:445 |  |
| `Allow dialogue to be split across page breaks` | row name | folio-settings.js:446 |  |
| `Dialogue that doesn't fit on the page continues onto the next page, with (MORE) and (CONT'D).` | row description | folio-settings.js:446 |  |
| `Bottom of the page` | row name (text field, value (MORE)) | folio-settings.js:447 |  |
| `Shown below dialogue that continues on the next page.` | row description | folio-settings.js:447 |  |
| `Top of the next page` | row name (text field, value (CONT'D)) | folio-settings.js:448 |  |
| `Shown beside the speaker's name for continued dialogue.` | row description | folio-settings.js:448 |  |
| `Bookmarks` | row name | folio-settings.js:449 |  |
| `A bookmark in the PDF's sidebar for each scene and branch.` | row description | folio-settings.js:449 |  |
| `Bookmark hidden section names` | row name | folio-settings.js:450 |  |
| `Scene and branch names get a bookmark even when they're not printed on the page.` | row description | folio-settings.js:450 |  |
| `(MORE)` | default text of the Bottom of the page field | folio-settings.js:204 |  |
| `(CONT'D)` | default text of the Top of the next page field | folio-settings.js:205 |  |

### Add menu

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Add menu` | section heading | app.js:2261 |  |
| `Specify which folders determine what's shown in each Add menu category.` | section description | app.js:2263 |  |
| `Try in Add` | button beside the heading | app.js:2264 |  |
| `Folders` | group legend | app.js:2267 |  |
| `Backdrop` | row name (field holds the folder name, default Backdrops) | app.js:2240, folio-insert.js:30, folio-insert.js:116 |  |
| `Portrait` | row name (default Portraits) | app.js:2241, folio-insert.js:31, folio-insert.js:117 |  |
| `Music` | row name (default Music) | app.js:2242, folio-insert.js:32, folio-insert.js:119 |  |
| `Sound` | row name (default Sounds) | app.js:2243, folio-insert.js:33, folio-insert.js:118 |  |
| `Contains ` | row description: `Contains ` + count + ` ` + unit, with s when not 1 | app.js:2251 |  |
| `backdrop file` | unit in that description | app.js:2240 |  |
| `portrait file` | unit in that description | app.js:2241 |  |
| `music file` | unit in that description | app.js:2242 |  |
| `sound file` | unit in that description | app.js:2243 |  |
| `Contains nothing yet` | row description when the folder finds nothing | app.js:2251 |  |
| `Portrait thumbnails` | group legend | app.js:2284 |  |
| `Choose how much of each portrait to show for portrait thumbnails in the Add menu.` | group note | app.js:2284 |  |
| `Visible area` | row name | app.js:2285 |  |
| `Original` | caption of the uncropped example | app.js:2285 |  |
| `Imani's complete portrait` | alt text of the uncropped example | app.js:2285 |  |
| `Thumbnail` | caption of the cropped example | app.js:2285 |  |
| `Top 25%` | scale label at the left of the slider | app.js:2285 |  |
| `Whole image` | scale label at the right of the slider | app.js:2285, folio-insert.js:139 |  |
| `Used for thumbnails only. Does not affect the size of the portrait in your game.` | hint | app.js:2285 |  |

### File types

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `File types` | section heading | folio-settings.js:328, folio-settings.js:595 |  |
| `The file extensions detected by each type of asset.` | section description | folio-settings.js:331 |  |
| `Scripts` | row name | folio-settings.js:299 |  |
| `Story and logic written in sparkdown.` | row description | folio-settings.js:299 |  |
| `Images` | row name | folio-settings.js:300 |  |
| `Backdrops, portraits and other pictures.` | row description | folio-settings.js:300 |  |
| `Audio` | row name | folio-settings.js:301 |  |
| `Sounds and music the game plays.` | row description | folio-settings.js:301 |  |
| `Fonts` | row name | folio-settings.js:302 |  |
| `Typefaces for the game's text.` | row description | folio-settings.js:302 |  |

### Save & sync

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Save & sync` | section heading | app.js:2317 |  |
| `Saved to this device` | row name (the tag at the right shows the save status) | app.js:2319 |  |
| `Saved as you write. (Clearing your browser's site data may irrevocably delete your data.)` | row description | app.js:2319 |  |
| `Download a backup` | row name | app.js:2323 |  |
| `Every script and asset as a .zip, named after the project.` | row description | app.js:2323 |  |
| `Download .zip` | button | app.js:2323 |  |
| `Import a project` | row name | app.js:2324 |  |
| `Replace this project with the contents of a backup. Files the backup lacks are removed.` | row description | app.js:2324 |  |
| `Choose a .zip…` | button | app.js:2324 |  |
| `Backup & sync online` | row name | app.js:2325 |  |
| `Keep a copy on Google Drive for online backup, revision history and working on other devices. Optional; nothing here needs an account.` | row description | app.js:2325 |  |
| `Connect Google Drive` | button | app.js:2325 |  |

### Prototype review

These controls and notes belong to the design study, not to the product.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Prototype review` | heading | app.js:2331 |  |
| `Temporary controls and notes for this local design study.` | description | app.js:2332 |  |
| `Prototype guide` | button | app.js:2333 |  |
| `Choice icon options` | button | app.js:2333 |  |
| `Syntax color mapping` | button | app.js:2333 |  |
| `Empty project` | button | app.js:2333 |  |
| `Return to demo project` | button | app.js:2333 |  |
| `Reset this script` | button | app.js:2333 |  |
| `Clear this script` | button (empty-project study) | app.js:2333 |  |
| `Your scripts and writing positions stay here. Reset restores the current supplied script; original project files are untouched.` | caption | app.js:2335 |  |
| `settings.json written on export` | disclosure summary | app.js:2336 |  |
| `What Export would write for VS Code from this project’s settings: only the values that differ from the usual ones. Branch names and Add menu folders have no VS Code setting yet, so they are left out.` | disclosure text | app.js:2336 |  |
| `What this prototype saves and simulates` | disclosure summary | app.js:2337 |  |
| `Project settings (Add menu folders and Screenplay) are saved with this draft, so the empty project starts with the usual ones. Themes, syntax highlighting, writing and thumbnail preferences, the preview’s screenplay page, pane sizes and the preview aspect ratio are saved in this browser. Original uses the 17 colors measured in the live engine sample; Softened reduces their intensity without merging distinctions. Midnight and Dusk both use Original, with Dusk slightly reducing the navy backgrounds’ saturation. Recognition uses a prototype highlighter, not the engine grammar; the full syntax showcase is read-only. The Screenplay preview shows the title page, bold headings, scene numbers and printed names; paper size, page breaks and bookmarks apply only to a PDF, which this prototype does not make. Full-project import, backup and sync are not active in this prototype, nor are Close angle brackets, Convert Ink syntax when formatting, the two follow-the-cursor switches and File types, which are saved here; File types are written on export. The phone keyboard is a layout simulation. All pages and assets remain on this machine.` | disclosure body | app.js:2337 | design-study note, not product copy |
| `This empty-project study has its own saved draft. Your demo project is kept separately.` | caption, empty project only | app.js:2334 | design-study note |
| `Your demo draft could not be saved.` | caption when saving fails, in place of `Draft saved in this browser.` | app.js:2335 | design-study note |

## Accessible values, announcements and messages

Text read out by assistive technology or shown as a status or error, built in scripts rather than markup.

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Writing ` | live-region announcement on opening Story: this text + the open script's name | app.js:3674 |  |
| `Choice added to the scene` | live-region announcement on the choice route | app.js:3677 |  |
| `Script ` | aria-valuetext of the pane divider: this text + the script's percentage + `%, preview ` + the preview's + `%` | folio-split.js:18 |  |
| `%, preview ` | piece of that value | folio-split.js:18 |  |
| `Viewing mode: ` | aria-label of the viewing-mode button: this text + the mode's name | folio-playback.js:767 |  |
| `Game ` | aria-valuetext of the divider above the Problems panel: this text + pixels + ` pixels, panel ` + pixels + ` pixels`, then `, collapsed` when closed | folio-console.js:255 |  |
| ` pixels, panel ` | piece of that value | folio-console.js:255 |  |
| ` pixels` | piece of that value | folio-console.js:255 |  |
| `, collapsed` | piece of that value | folio-console.js:255 |  |
| ` problems on line ` | aria-label of a line's problem popover with several problems: the count + this text + the line number | folio-problems.js:62 |  |
| `, line ` | aria-label of a single problem's popover: `Error`, `Warning` or `Note`, `: `, its title, this text, the line number | folio-problems.js:62 |  |
| `Error` | severity name in that label | folio-problems.js:49 | also `Warning`, `Note` |
| `, a portrait` | aria-label of the Settings sample's portrait hover card: the reference + this text | folio-themes.js:310 |  |
| `Zoom 100%` | inspector zoom status at actual size | folio-assets.js:847 |  |
| `Zoom ` | inspector zoom status when enlarged: this text + the percentage + `%, fit to frame` | folio-assets.js:847 |  |
| `%, fit to frame` | piece of that status | folio-assets.js:847 |  |
| ` is larger than 1.5 MB, which is the prototype's limit for files kept in the browser.` | upload error: the file's name + this text | folio-assets.js:2144 | prototype limit |
| `Choose a ` | Replace error when the new file is another type: this text + the tab's name in lower case (for example `images`) + ` file to replace this one.` | folio-library.js:1215 |  |
| ` file to replace this one.` | piece of that error | folio-library.js:1215 |  |
| ` needs a group and an option, like face.happy.` | variants problem: the quoted part name + this text | folio-library.js:133 |  |
| `Two options are marked default in the ` | variants problem: this text + the group + ` group: ` + the options | folio-library.js:251 |  |
| ` group: ` | piece of that problem | folio-library.js:251 |  |
| `The ` | variants problem: this text + the group + the sentence below | folio-library.js:255 |  |
| ` group has no default, so nothing from it shows until the script chooses.` | piece of that problem | folio-library.js:255 |  |
| `Another file is also named ` | file problem: this text + the name + the sentence below | folio-library.js:976 |  |
| `. Rename one so the script can tell them apart.` | piece of that problem | folio-library.js:976 |  |

## Toasts

A toast is a short status message at the bottom of the screen; the role of every row here is toast. Where a toast carries an action button it is named in the note.

### Script and project

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Renamed the project to ` | toast: this text + the new name + a full stop | app.js:361 |  |
| `Added to the script.` | toast | app.js:534 |  |
| `Put your cursor inside a scene to add a choice.` | toast | app.js:563 |  |
| `That is not a valid pattern.` | toast | app.js:918, app.js:1039 |  |
| `Nothing to replace in any script.` | toast | app.js:1059 |  |
| `Replaced in ` | toast: this text + count, a space, `place` or `places`, a space, a place phrase and a full stop | app.js:1073 |  |
| `place` | toast piece (one replacement) | app.js:1073 |  |
| `places` | toast piece (several) | app.js:1073 |  |
| `across ` | place phrase: `across ` + n + ` scripts` | app.js:1068 |  |
| `in this script` | place phrase | app.js:1070 |  |
| `Nothing to tidy in this script.` | toast | app.js:1107 |  |
| `Spacing and indentation tidied.` | toast | app.js:1116 |  |
| `No matches in any script.` | toast | app.js:1388, app.js:3136 |  |
| `Renamed ` | toast: `Renamed ` + n + ` use` or ` uses` + ` in ` + n + ` script` or ` scripts`, then ` and ` + n + ` file` or ` files` + ` in your assets` when files changed, then a full stop | app.js:1568 |  |
| `Color changed to ` | toast: this text + the value + a full stop | app.js:1588 |  |
| `Paste with ` | toast: this text + the key + `: the browser keeps the clipboard to the keyboard here.` | app.js:1676 |  |
| `: the browser keeps the clipboard to the keyboard here.` | toast, end | app.js:1676 |  |
| ` to your assets. The line will work as soon as it is there.` | toast: `Add ` + the asset name + this text | app.js:1792 |  |
| `Fixed.` | toast when a fix has no message of its own | app.js:1816 |  |
| `Renamed to ` | toast: this text + the script name + a full stop | app.js:2013, app.js:2014 |  |
| `. Linked includes were updated.` | toast suffix after a script rename | app.js:2013 |  |
| `This recovered draft has no original to reset to. Your text is kept.` | toast | app.js:3284 |  |
| `This script was reset. You can undo this.` | toast | app.js:3294 |  |
| `This expression study uses an IMANI: passage.` | toast | app.js:3308 |  |
| `Add an IMANI: line to try her expression.` | toast | app.js:3340 |  |
| `Imani’s ` | toast: this text + the expression + ` expression added. Undo is here if you need it.` | app.js:3373 |  |
| ` expression added. Undo is here if you need it.` | toast, end | app.js:3375 |  |
| `No edits to undo yet.` | toast | app.js:3397 |  |
| `No edits to redo yet.` | toast | app.js:3397 |  |
| `Edit undone.` | toast | app.js:3409 |  |
| `Edit restored.` | toast | app.js:3409 |  |
| `No matching text. Try another word.` | toast | app.js:3437 |  |
| `Found in this script.` | toast | app.js:3443 |  |
| `This tool has a home here. Full text formatting is for the next round.` | toast | app.js:3459 |  |
| `Draft saved on this device.` | toast | app.js:3733 |  |
| `Downloading ` | toast: this text + the project name + `.zip.` + the sentence below | app.js:3471 |  |
| `.zip. (This prototype does not build the file.)` | toast, end | app.js:3471 |  |
| `Replaced. (This prototype keeps its own files; the real editor replaces every script and asset.)` | toast | app.js:3490 |  |
| `Signing in connects Google Drive: a copy of the project online, projects opened from Drive, and work carried on from other devices. Writing never needs it.` | toast after Sync with Google Drive | app.js:3495, app.js:3590 |  |
| `Help and guides will be available here.` | toast after Help & guide | app.js:3591 |  |
| `Bug reporting will be available here.` | toast after Report a bug | app.js:3592 |  |
| `No ` | toast: `No ` + `picture` or `sound` + ` named ` + the name + ` in your assets.` | app.js:1257 |  |
| `  named  ` | toast piece | app.js:1257 |  |
| ` in your assets.` | toast piece | app.js:1257 |  |

### Scripts page

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Downloading ` | toast: this text + the file name or a count of scripts + a full stop | folio-scripts.js:332, folio-scripts.js:333 |  |
| `Renamed.` | toast | folio-scripts.js:533 |  |
| `Folder created.` | toast | folio-scripts.js:536 |  |
| `Script duplicated.` | toast | folio-scripts.js:843 |  |
| `Moved` | toast: `Moved` (or `Moved ` + n + ` items`), ` to ` + the folder + a full stop | folio-scripts.js:555 |  |
| ` Linked includes were updated.` | toast suffix after a move | folio-scripts.js:555 |  |
| `  Not moved:  ` | toast suffix after a refused move | folio-scripts.js:555 |  |
| `Deleted` | toast: `Deleted ` + the name or a count of items + a full stop ; the toast carries the action button Undo | folio-scripts.js:692, folio-scripts.js:693, folio-scripts.js:730 |  |
| `Undo` | toast action button | folio-scripts.js:695 |  |
| `Restored.` | toast after Undo | folio-scripts.js:705 |  |
| `Deleted from the local draft.` | toast | folio-scripts.js:731 |  |

### Assets page

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Link saved.` | toast | folio-assets.js:1450 |  |
| `Copied.` | toast | folio-assets.js:1866 |  |
| `Could not copy.` | toast | folio-assets.js:1867 |  |
| `Replaced ` | toast: this text + the file name + a full stop | folio-assets.js:1956 |  |
| `Renamed.` | toast | folio-assets.js:1999, folio-assets.js:2397, folio-assets.js:2427 |  |
| `Renamed. Your scripts were updated.` | toast | folio-assets.js:2396 |  |
| `Deleted from the local draft.` | toast | folio-assets.js:2024, folio-assets.js:2547, folio-assets.js:2573 |  |
| `Replaced. Every line that shows it now uses the new file.` | toast | folio-assets.js:2298 |  |
| `Added ` | toast: this text + the file name + a full stop | folio-assets.js:2333 |  |
| `Folder created.` | toast | folio-assets.js:2354 |  |
| `Moved to ` | toast: this text + the folder or tab name + a full stop | folio-assets.js:2500, folio-assets.js:3066 |  |
| `Deleted ` | toast: this text + the name + a full stop; the toast carries the action button Undo | folio-assets.js:2523, folio-assets.js:2676 |  |
| `Undo` | toast action button | folio-assets.js:2524 |  |
| `Restored.` | toast after Undo | folio-assets.js:2529 |  |
| `Downloading ` | toast: this text + a count and the word file (with s unless the count is 1) + a full stop | folio-assets.js:2704 |  |
| `This browser could not play the sound.` | toast | folio-assets.js:257 |  |

### Problems panel

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Copied ` | toast: this text + a count and the word message (with s unless the count is 1) + a full stop | folio-console.js:449 |  |
| `Clipboard unavailable. Use Save to keep these messages.` | toast | folio-console.js:451 |  |
| `Played messages cleared.` | toast | folio-console.js:499 |  |

## Dialogs

Every dialog has a title with a Close dialog button, a body and buttons at the bottom. The dialogs of the Scripts and Assets pages add a Cancel button at the left of the primary button.

### Shared

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Close dialog` | aria-label of the close button | folio-scripts.js:486, folio-assets.js:638, app.js:3620 |  |
| `Cancel` | button | folio-scripts.js:486, folio-assets.js:519, folio-assets.js:638 |  |

### Problems to fix

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Problems to fix` | dialog title | app.js:1944 |  |

The body is a context line, the name of the scope, a ` · ` and the counts, then the problem entries (see Problems panel).

### Replace this project?

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Replace this project?` | dialog title | app.js:3506 |  |
| `Everything in ` | body: this text + the project name, then the text below | app.js:3507 |  |
| `  is replaced by the contents of  ` | body, middle: then the backup file name | app.js:3507 |  |
| `: its ` | body, middle: then the script count | app.js:3507 |  |
| `  scripts and  ` | body, middle: then the asset count | app.js:3507 |  |
| ` assets go, and any file the backup lacks is removed for good. The recycle bin does not keep them.` | body, end | app.js:3507 |  |
| `To keep what you have, download a backup first.` | body, second paragraph | app.js:3507 |  |
| `Cancel` | button | app.js:3508 |  |
| `Replace project` | button | app.js:3508 |  |

### New script and New folder

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `New ` | dialog title: `New ` + script or folder | folio-scripts.js:517 |  |
| `In ` | context line: `In ` + the folder | folio-scripts.js:518 |  |
| `Script` | label: followed by ` name` | folio-scripts.js:518, folio-scripts.js:745 |  |
| `Folder` | label: followed by ` name` | folio-scripts.js:518, folio-scripts.js:746 |  |
| `.sd` | suffix beside the script name field | folio-scripts.js:518 |  |
| `Create ` | button: `Create ` + script or folder | folio-scripts.js:515 |  |
| `Cancel` | button | folio-scripts.js:486 |  |

### Rename a script or folder

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Rename ` | dialog title: `Rename ` + script or folder | folio-scripts.js:517 |  |
| `Rename` | button | folio-scripts.js:515, folio-scripts.js:823 |  |

### Move

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Move ` | dialog title: `Move ` + the name, or `Move ` + a count of items | folio-scripts.js:590 |  |
| `Move here` | button | folio-scripts.js:592 |  |
| `No subfolders` | caption when the folder has none | folio-scripts.js:614 |  |

### Delete (scripts)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Delete ` | dialog title: `Delete ` + the name + `?`, or `Delete ` + a count of items + `?` | folio-scripts.js:712 |  |
| `This script will be removed from your local draft.` | body | folio-scripts.js:713 |  |
| `This folder and the scripts inside it will be removed from your local draft.` | body | folio-scripts.js:713 |  |
| `These ` | body: this text + a count of items + the sentence below | folio-scripts.js:713 |  |
| `, and the scripts inside any folders among them, will be removed from your local draft.` | body, end | folio-scripts.js:713 |  |
| `includes` | body, second paragraph: the scripts that include it, a space, this word or `include`, a space, then `this script`, `folder’s scripts` after `this ` or `some of them`, then the sentence below | folio-scripts.js:713 |  |
| `include` | body, second paragraph | folio-scripts.js:713 |  |
| `. Those references will need updating.` | body, end | folio-scripts.js:713 |  |
| `Delete` | button | folio-scripts.js:714 |  |

### Add a link

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Add a link` | dialog title | folio-assets.js:2306, folio-assets.js:2794 |  |
| `A link keeps a file that lives on the web, such as a picture you host elsewhere. It is listed with files of its kind.` | body | folio-assets.js:2307 |  |
| `Address` | label | folio-assets.js:1648, folio-assets.js:2307 |  |
| `Name` | label | folio-assets.js:2307, folio-assets.js:2366 |  |
| `https://` | placeholder | folio-assets.js:1648, folio-assets.js:2307 |  |
| `Add link` | button | folio-assets.js:2308 |  |
| `Enter a full address starting with http:// or https://.` | error message | folio-library.js:1244 |  |

### New folder and Rename folder (Assets)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `New folder` | dialog title | folio-assets.js:2343, folio-assets.js:2800 |  |
| `In ` | context line | folio-assets.js:2344, folio-assets.js:2802 |  |
| `Folder name` | label | folio-assets.js:2344, folio-assets.js:2409 |  |
| `Create folder` | button | folio-assets.js:2345 |  |
| `Rename folder` | dialog title | folio-assets.js:2408 |  |
| `Rename` | button | folio-assets.js:1987, folio-assets.js:2367, folio-assets.js:2410 |  |

### Rename a file or asset

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Rename ` | dialog title: `Rename ` + the file name, or `Rename ` + the unit (image, sound, video, note, font or file) | folio-assets.js:1985, folio-assets.js:2365 |  |
| `File name` | label (a file of a stacked image) | folio-assets.js:1986 |  |
| `The part before the first ~ names the picture the file belongs to; what follows a ~ is the layer's condition, and @ names an alternate. The lines that use this name are not changed.` | body note | folio-assets.js:1986 |  |
| `Name` | label (an asset) | folio-assets.js:2307, folio-assets.js:2366 |  |
| `Also update the ` | checkbox label: this text + a count and the word line (with s unless the count is 1) + ` in your scripts that use this name` | folio-assets.js:2366 |  |
| ` in your scripts that use this name` | checkbox label, end | folio-assets.js:2366 |  |
| `Every variant keeps its suffix: ` | body note: this text + the suffixes | folio-assets.js:2366 |  |
| `Rename` | button | folio-assets.js:1987, folio-assets.js:2367, folio-assets.js:2410 |  |

### Move (Assets)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Move ` | dialog title: `Move ` + the name or a count of items | folio-assets.js:2445 |  |
| `Move here` | button | folio-assets.js:2447 |  |
| `No subfolders` | caption | folio-assets.js:2464 |  |

### Delete (Assets)

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Delete ` | dialog title: `Delete ` + the name + `?` | folio-assets.js:2010, folio-assets.js:2535, folio-assets.js:2560 |  |
| `Its ` | body: this text + a count of files + ` will be removed from your local draft.` | folio-assets.js:2536 |  |
| ` will be removed from your local draft.` | body, end | folio-assets.js:2536, folio-assets.js:2561, folio-assets.js:2659 |  |
| `It will be removed from your local draft.` | body | folio-assets.js:2536 |  |
| `  in your scripts still  ` | body, second paragraph: a count and the word line (with s unless the count is 1) + this + `shows` or `show` + ` it.` + the sentence below | folio-assets.js:2536, folio-assets.js:2659 |  |
| `. Those lines will report a missing file until you change them.` | body, end (single asset: ` it` before the full stop) | folio-assets.js:2536, folio-assets.js:2659 |  |
| `This folder` | body: this text, then ` and the ` + a count of items + ` inside it` when it holds some, then ` will be removed from your local draft.` | folio-assets.js:2561 |  |
| ` will be removed from your local draft.` | body, end | folio-assets.js:2536, folio-assets.js:2561, folio-assets.js:2659 |  |
| `Delete` | button | folio-assets.js:2012, folio-assets.js:2537, folio-assets.js:2562 |  |

### Delete a layer, alternate or file

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `This ` | body: this text + layer, alternate or file + ` will be removed from your local draft; the rest of ` + the picture name + ` stays.` | folio-assets.js:2011 |  |
| `  will be removed from your local draft; the rest of  ` | body, middle | folio-assets.js:2011 |  |
| ` stays.` | body, end | folio-assets.js:2011 |  |
| `It is the picture the layers sit on. Without it the layers rest on nothing and will report a missing base.` | body, second paragraph when deleting a Base file | folio-assets.js:2011 |  |

### Name errors

| String | Role | Source | Note |
| --- | --- | --- | --- |
| `Enter a name.` | error message | folio-library.js:572, folio-library.js:584, folio-files.js:31 |  |
| `Use letters, digits, underscores and hyphens only; the script refers to files by this name.` | error message (asset names) | folio-library.js:575 |  |
| `Use a name without slashes or special file characters.` | error message | folio-library.js:586, folio-files.js:32 |  |
| `Keep the name to 120 characters or fewer.` | error message | folio-library.js:578, folio-library.js:588, folio-files.js:34 |  |
| `Choose a different name. This name is reserved.` | error message | folio-files.js:33 |  |
| `That name is already in use in this folder.` | error message | folio-library.js:1086, folio-library.js:1122, folio-library.js:1167 |  |
| `That name is already used by another file in your assets.` | error message | folio-library.js:1116 |  |
| `This folder no longer exists.` | error message | folio-library.js:1161, folio-files.js:39 |  |
| `A folder cannot be moved inside itself.` | error message | folio-library.js:1164, folio-library.js:1185, folio-files.js:43 |  |

## Absent from the prototype, or left out

The ticket names strings that the prototype at c2fe740 does not contain. Searched: folio.html, app.js and every folio-*.js file.

- Saved to Google Drive: no such string, and no string for any Drive sync state (syncing, last synced, offline). The nearest strings are `Sync now` (app.js:872, a hidden button), `Sync with Google Drive` (app.js:3577), `Backup & sync online` (app.js:2325) and `Connect Google Drive` (app.js:2325). Taken: "Saved to Google Drive", the wording Feature #977 and #979 give, as the Drive counterpart of `Saved to this device`; it is the one caption here not quoted from the prototype.
- Go to line: no such string; Go to line is one of the homes Feature #977 adds for a function the prototype omits. The nearest are the caret readout `Line `, `, Col ` (see Script header and writer's bar) and `Go to definition` (app.js:1684). Taken: "Go to line", the Feature's name.
- Logic, URL, cache, Untitled Game and the theme name Paper: absent as interface copy (see Old word → new word).
- Left out on purpose: the welcome page (`folio.html#welcome`, app.js:837-838), which Feature #977 puts out of scope, and the stand-in phone keyboard (app.js:833), which only simulates the device's keyboard.
- Two dialogs exist in app.js that no control opens: `Find in this script` (app.js:3423, button `Find line`) and `It reads like a story` (app.js:3450). They are left out of Dialogs.

## Inconsistencies

Live markup wins over the notes. Where the live markup itself uses two wordings, each surface keeps its own wording as quoted above. File:line pairs are given for both sides.

- Save status, one state, six wordings in live markup: top bar caption `Draft saved` (app.js:866), sidebar footer and app menu title `Saved locally` (app.js:619), Settings row `Saved to this device` (app.js:2319), caption link title `Saved in this browser. Open Save & sync.` (app.js:866), toast `Draft saved on this device.` (app.js:3733), and Prototype review caption `Draft saved in this browser.` (app.js:2335). The live markup uses each on its own surface.
- Local-only label: change-list.md:261 and folio/decisions.md:399 say the signed-out footer reads "On this device"; change-list.md:253 and folio/decisions.md:405 say "Saved locally". The live markup uses `Saved locally` (app.js:619); "On this device" appears nowhere in the code.
- Cloud entry: README.md:39 and change-list.md:261 call the app-menu item "Sign in". The live markup uses `Sync with Google Drive` (app.js:3577) in the app menu and `Connect Google Drive` (app.js:2325) on the Settings button, and the toast says `Signing in connects Google Drive: ` (app.js:3495).
- Third message filter: README.md:86, change-list.md:233 and folio/decisions.md:421 name it "Info". The live markup uses `Notes` (folio-console.js:8) and the word `note` (folio-console.js:9).
- Sidebar heading: change-list.md:588 says the sidebar shows "Scenes" and a count. The live markup uses `Outline` (app.js:1986).
- Metadata section: change-list.md:26, change-list.md:31 and folio/decisions.md:165 call it "Story details". The live markup uses `Project metadata` as the section heading (app.js:2310) and `Metadata` as its index entry (folio-settings.js:592); the section id is still story-details.
- Search: README.md:144 says Ctrl or Command F opens "Find & replace". The live markup uses `Search` everywhere (app.js:876, folio-tools.js:205, folio-shortcuts.js:33).
- Main's marker: change-list.md:198 and folio/decisions.md:21 describe a "Start" badge on Main. The live markup uses the caption `Entry script` (folio-scripts.js:442).
- Settings name: README.md:21 and README.md:110 write "Project & preferences". The live markup uses `Settings` as the page heading and rail heading (app.js:2297), with `Editor & Project Preferences` as the eyebrow (app.js:2298).
- Themes: README.md:7 compares four themes (Graphite, Warm Folio, Midnight, Dusk). The live markup offers nine, adding `Automatic`, `Charcoal`, `Chalk`, `Ink` and `Sepia` (folio-themes.js:5 to folio-themes.js:15).
- Choice menu: the Add entry is `Choice Menu` (folio-insert.js:114) but the outline row prefix is `Choose: ` (app.js:1843) and the source keyword is choose.
- Starting playback: the button is `Play From Here` (folio-playback.js:585), its tooltip is `Play from the selected beat` (folio-playback.js:967) and the phone strip button is `Play from this line` (app.js:827).
- Fullscreen: the button is `Fullscreen preview` (folio-playback.js:587) while the expanded region is labelled `Fullscreen game preview` (folio-playback.js:1092).
- Residual old word: the Scripts file type description reads `Story and logic written in sparkdown.` (folio-settings.js:299), the only place the prototype uses the word logic for the story.
- Two names for one action: the writing tools row and the right-click menu say `Go to definition` (app.js:1684); the caret context button says `Go to ` + the name (app.js:1609).
- Export a screenplay: Feature #977 describes the card as live (PDF and HTML, with the settings it will use), but the prototype tags it `Coming soon` like the other three cards (app.js:2215) while also showing the settings summary and `Screenplay settings` (app.js:2216). Taken: the card's title, description, summary and link as quoted; whether it carries the tag is the Share Feature's decision, since the export works today.
- Replace error article: the Replace error writes `Choose a ` before the tab's name in lower case (folio-library.js:1215), so it reads "Choose a images file to replace this one." and "Choose a audio file…". Taken: the quoted pieces as the prototype has them; the article is the Assets Feature's to correct.
