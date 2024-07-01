
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

### 2. The `@` operator will open a dialogue block

Starting a line with `@` causes all lines below to be interpreted as dialogue text for the specified character until the next empty line.

For example this:

```
@ HAMLET
To be, or not to be, that is the question.
Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.
Or to take arms against a sea of troubles and by opposing, end them.
```

Is syntactically equivalent to:

```
@ HAMLET: To be, or not to be, that is the question.
@ HAMLET: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.
@ HAMLET: Or to take arms against a sea of troubles and by opposing, end them.
```

This also means that we can start dialogue lines with a syntax keyword (`*`, `+`, `-`, `~`, `==`, `=`, `VAR`, `CONST`, `LIST`, `INCLUDE`, `EXTERNAL`, etc.) without having to manually escape them.

For example, in the text block below, the dialogue line starting with `INCLUDE` does not have to be manually escaped:

```
@ THE KILLER
And did you ever consider...
That the list of suspects might, in fact...
INCLUDE ME???
```

---

### 3. Ending a line of text with a `\` backslash will cause the next line of text to display on a new line in the same textbox.

```
All the world’s a stage, \
And all the men and women merely players.
```

This joins text together in a similar way to the `<>` glue operator, with a few key differences:

  1. Unlike glue, `\` preserves a single newline between the joined text.
  2. The next line will always be interpreted as plain text, even if it starts with a syntax keyword
    ```
    And now, for all the points... \
    DEFINE DISESTABLISHMENTARIANISM.
    ```

` \ ` can also be used to insert a newline in the middle of text.

```
All the world’s a stage, \ And all the men and women merely players.
```

---

### 4. Front Matter can be specified by surrounding a block of text with `---`

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

### 5. You can define objects and arrays with `DEFINE`

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

### 6. You can specify an object's type with `DEFINE type.name`

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

### 7. You can access object properties and array elements

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

### 8. Compiler errors now include exact source location

An additional `source` parameter has been added to the compiler's error handler. 

This parameter includes an error's filename, start line, start column, end line, and end column, so we can display the error in a text editor exactly where it appears in the source file.
