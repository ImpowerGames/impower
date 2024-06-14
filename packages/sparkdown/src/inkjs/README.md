
# InkJS (Sparkdown Flavor)

Spark games utilize a slightly modified version of [inkjs](https://github.com/y-lohse/inkjs/) compiler -- a javascript port of inkle's [ink](https://github.com/inkle/ink) scripting language -- to compile and run sparkdown.

While the inkjs engine remains largely untouched, the new compiler diverges from the standard inkjs compiler in a few important ways in order to more easily support sparkdown without requiring the user to do too much manual escaping or tagging.

Each of these changes are explained below...

## Engine Changes:

### 1. Internal whitespace is no longer collapsed at runtime

Since whitespace is syntactically relevant in sparkdown, the inkjs engine has been updated to no longer collapse whitespace when outputting text.

This way we can continue using the number of spaces to determine things like the length of pauses between words when text is typing out.

## Compiler Changes:

### 1. Whitespace is now required after all choice, logic, gather, and clause operators

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

### 2. The `@` operator will open a text-only block

Starting a line with `@` causes all lines below to be interpreted as text until the next empty line or the end of the file.

This allows us to do three things:

1. It makes it easier for the user to write large blocks of dialogue lines without having to repeatedly specify the character for every line.

    ```
    @ POLONIUS 
    I hear him coming.
    Let’s withdraw, my lord.

    They withdraw.

    Hamlet enters.

    @ HAMLET
    To be, or not to be, that is the question:
    Whether 'tis nobler in the mind to suffer <>
    the slings and arrows of outrageous fortune.
    Or to take arms against a sea of troubles <>
    and by opposing, end them. 
    To die -- to sleep, No more.
    And by a sleep to say we end <>
    the heart-ache and the thousand natural shocks <>
    that flesh is heir to. 
    'Tis a consummation devoutly to be wished.
    ```

2. It allows the user to write lines of dialogue that start with a syntax keyword (`*`, `+`, `-`, `~`, `==`, `=`, `VAR`, `CONST`, `LIST`, `INCLUDE`, `EXTERNAL`, etc.) without having to manually escape them. 

    For example, in the text block below, the dialogue line starting with `INCLUDE` does not have to be manually escaped:

    ```
    @ THE KILLER
    And did you ever consider...
    That the list of suspects might...
    In fact...
    INCLUDE ME???
    ```

3. Since the compiler collapses consecutive newlines, the empty line following a text block is included in the final compiled json as a text line starting with the special termination keyword `/@`.

    This allows the runtime to detect when a block of dialogue has ended and text should no longer be associated with a character.

    One side effect of this block termination logic, is that manually typing `/@` will also end a dialogue block.

    ```
    @ JAQUES
    All the world’s a stage,
    And all the men and women merely players.
    /@
    And this line is not part of the character's dialogue.
    ```

    But it is recommended to rely on empty lines instead for readability:

    ```
    @ BURNS
    How long is it?

    Hildy finishes lighting her cigarette, <>
    takes a puff, and fans out the match.

    @ HILDY
    How long is what?

    @ BURNS
    You know what.
    How long since we've seen each other?
    ```
---

### 3. Front Matter can be specified by surrounding a block of text with `---`

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

### 4. You can define objects and arrays with `DEFINE`

The new compiler supports using yaml-esque syntax to define constant objects and arrays:

```
DEFINE alison:
  first_name = "Alison"
  last_name = "Smith"
  nickname = "Allie"

DEFINE fears:
  - "spiders"
  - "heights"
  - "darkness"
```

---

### 5. You can specify an object's type with `DEFINE type.name`

An object's type can be specified by prefixing its name with a type and a dot separator

This will ensure that the object inherits all properties from the defined type (and overrides them if specified).

```
DEFINE character:
  first_name = "???"
  last_name = "???"
  nickname = "???"
  voice = "mid"
  color = "#FFFFFF"

DEFINE character.alison:
  first_name = "Alison"
  last_name = "Smith"
  nickname = "Alice"
  voice = "high"

DEFINE character.robert:
  first_name = "Robert"
  last_name = "Smith"
  nickname = "Bob"
  voice = "low"
```

At runtime, these types are used to lookup things like `character`, `ui`, `style`, and more.

Just like CONST variables, DEFINEs can't be changed at runtime and aren't saved in the save state. 

So they are mostly used for configuration:

```
define style.dialogue:
  color = "#FFFFFF"
  background_color = "#0000FF"
  text_wrap = "nowrap"
  border = "1px solid #000000"
```

---

### 6. You can access object properties and array elements

Although you cannot change their value, you can read an object's properties with dot notation:

```
His name is {character.robert.first_name} {character.robert.last_name}.
But his friends call him {character.robert.nickname}.
```

And access array elements with bracket notation:

```
I am most afraid of {fears[0]}.
```

---

### 7. Compiler errors now include exact source location

An additional `source` parameter has been added to the compiler's error handler. 

This parameter includes an error's filename, start line, start column, end line, and end column, so we can display the error in a text editor exactly where it appears in the source file.
