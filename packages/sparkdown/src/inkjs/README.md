# InkJS (Sparkdown Flavor)

Sparkdown began as a modified version of the [inkjs](https://github.com/y-lohse/inkjs/) compiler and engine, a JavaScript port of inkle's [ink](https://github.com/inkle/ink) scripting language.

What stays of that fork in this directory is the parsed hierarchy (`compiler/Parser/ParsedHierarchy/`), whose classes the lowerer builds from the syntax tree and which emit the statement chunks a story runs as (`EmitProgram`), and `compiler/Parser/ErrorType.ts`. The inkjs engine is gone (#705): stories run on the binary program engine, `../program/ProgramStory.ts`, on the value layer kept from the inkjs runtime in `../runtime/` (see [its README](../runtime/README.md)). The [Sparkdown Runtime Guide](../../docs/runtime/RUNTIME.md) describes how a story runs.

The sections below record how the fork diverged from standard inkjs. The engine changes are history. The compiler changes describe the fork's ink parser, which the lowerer has since replaced, and much of the syntax they show has changed with it; [`DIVERGENCES.md`](../../docs/runtime/DIVERGENCES.md) describes the language as it is.

## Engine Changes (history):

### 1. Internal whitespace is no longer collapsed at runtime

Since whitespace is syntactically relevant in sparkdown, the inkjs engine was changed to no longer collapse whitespace when outputting text.

This way we can continue using the number of spaces to determine things like the length of pauses between words when text is typing out.

The program engine keeps this: a game turns off `collapseWhitespace` and `processEscapes` on its story (`cleanOutputWhitespace` in `../runtime/outputWhitespace.ts`).

### 2. Story had an onWriteRuntimeObject callback

This was called when an InkObject was compiled into a runtime object, to record the runtime path of a particular script statement. It went with the inkjs engine (#705): a statement's position is now an address, which `ProgramStory.onExecute` reports as each instruction runs.

## Compiler Changes:

### 1. The keywords `var` `const` `list` `external` and `include` can be lowercase

This helps keep our keyword naming convention consistent across the entire syntax.

### 2. Whitespace is now required after all choice, logic, gather, and clause operators

The space following a choice, logic, gather, and clause operator is no longer optional.

That means `*`, `+`, `~`, `-`, and `=` must be followed by at least one whitespace for the compiler to recognize it as an instruction.

```
* [choice]
+ [choice]

~ logic()

- (gather)

{ x:
  - 0: clause
  - 1: clause
  - 2: clause
  - else: clause
}

== knot

= stitch
```

Space is also required between nesting operators:

```
* * * [choice]
+ + + [choice]
- - - (gather)
```

This allows us to utilize markdown-esque styling syntax at the start of a line without the styling symbols being confused for instruction operators:

```
*This* will be italic.
**This** will be bold.
~~This~~ will be wavy.

* This is a choice.
* **This choice text is bolded.**
```

---

### 3. Ending a line of text with a `\` backslash will cause the next line of text to display on a new line in the same textbox.

```
All the world’s a stage, \
And all the men and women merely players.
```

The `\` backslash operator joins text together in a similar way to the `<>` glue operator, with a few key differences:

1. Unlike glue, `\` preserves a single newline between the joined text.
2. The next line will always be interpreted as plain text, even if it starts with a syntax keyword


    ```
    And did you consider that might... \
    include me??
    ```

3. If the next line of text is empty, `\` will do nothing.


    ```
    This does nothing. \

    This line will appear in a new textbox.
    ```

### 4. `\ ` can be used to insert a newline in the middle of text

(NOTE: For these mid-line breaks, the backslash must be followed by at least one space).

```
All the world’s a stage, \ And all the men and women merely players.
```

---

### 5. Front Matter can be specified by surrounding a block of text with `---`

Front Matter can be used to conveniently store multiline metadata about a story.

In sparkdown, this metadata is used to populate the title page when exporting the story as a screenplay.

The compiler will automatically convert all front matter fields to `# key: value` tags. However, unlike regular `#` tags, front matter cannot contain any inline logic, only plain text.

```
---
title:
  _**BRICK & STEEL**_
  _**FULL RETIRED**_
credit: Written by
author: Stu Maschwitz
source: Story by KTM
date: 1/20/2012
contact:
  Next Level Productions
  1588 Mission Dr.
  Solvang, CA 93463
---
```

---

### 6. You can define objects and arrays with `define`

The new compiler supports using yaml-esque syntax to define constant objects and arrays:

```
define alison:
  first_name = "Alison"
  last_name = "Smith"
  nickname = "Allie"

define fears:
  - "spiders"
  - "heights"
  - "darkness"
```

---

### 7. You can specify an object's type with `DEFINE type.name`

An object's type can be specified by prefixing its name with a type and a dot separator

This will ensure that the object inherits all properties from the defined type (and overrides them if specified).

```
define character:
  first_name = "???"
  last_name = "???"
  nickname = "???"
  voice = "mid"
  color = "#FFFFFF"

define character.alison:
  first_name = "Alison"
  last_name = "Smith"
  nickname = "Alice"
  voice = "high"

define character.robert:
  first_name = "Robert"
  last_name = "Smith"
  nickname = "Bob"
  voice = "low"
```

Defines can't be set at runtime and aren't saved in the save state.
So they are mostly useful for configuration:

```
define style.dialogue:
  color = "#FFFFFF"
  background_color = "#0000FF"
  border = "1px solid #000000"
```

---

### 8. Compiler errors now include exact source location

An additional `source` parameter has been added to the compiler's error handler.

This parameter includes an error's filename, start line, start column, end line, and end column, so we can display the error in a text editor exactly where it appears in the source file.

Several of the ink compiler's diagnostic messages have also been updated to be more exact in their wording.
