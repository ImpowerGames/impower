
# InkJS (Sparkdown Flavor)

Spark games utilize a slightly modified version of [inkjs](https://github.com/y-lohse/inkjs/) compiler -- a javascript port of inkle's [ink](https://github.com/inkle/ink) scripting language -- to compile and run sparkdown.

While the inkjs engine remains untouched, the new compiler diverges from the standard inkjs compiler in a few important ways in order to more easily support sparkdown without requiring the user to do too much manual escaping or tagging.

Each of these changes are explained below...

## 1. Whitespace is required after all choice, logic, gather, and clause operators

The space following a choice, logic, gather, and clause operator is no longer optional. 

That means `*`, `+`, `~`, and `-` must be followed by at least one whitespace for the compiler to recognize it as an instruction. 

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

## 2. The `@` operator will open a text-only block

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

3. Since the engine trims away all empty lines, the empty line following a text block is included in the final compiled json as a text line starting with the special termination keyword `/@`.

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

## 3. Front Matter can be specified by surrounding a block of text with `---`

Front Matter can be used to conveniently store multiline metadata about a story.

In sparkdown, this metadata is used to populate the title page when exporting the the story as a screenplay.

The compiler will automatically convert all front matter fields to `# key: value` tags. However, unlike regular # tags, front matter cannot contain any inline logic, only plain text.

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
