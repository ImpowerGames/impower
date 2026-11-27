# Fonts

A font file in your project becomes a font named by its file name, without the extension: `title.ttf` is the font `title`.

## Bold and italic files

A family's bold and italic files sit beside its regular file. Name each one after the family, then `@`, then its style:

```
title.ttf             title, regular
title@bold.ttf        title, bold
title@italic.ttf      title, italic
title@bolditalic.ttf  title, bold italic
```

The family is the text before the first `@`. The style after it is `bold`, `italic`, `bolditalic` or `italicbold`, in any letter case. A style may also be written as several `@` words in any order, so `title@bold@italic.ttf` and `title@italic@bold.ttf` are also the bold italic file of `title`. If any word after the family is not a style word, or is empty as in `title@@bold.ttf`, the whole name is a separate regular font: `title@light.ttf` and `title@bold@light.ttf` are the fonts `title@light` and `title@bold@light`. Scripts and styles name the family only, and the engine loads every file of the family and picks the one that matches the text's weight and style. In a Visual Novel, dialogue is drawn inside the built-in `textbox` element (see [Screens & Navigation](./Screens.md)), so this sets its font, with `**bold**` words drawn from `title@bold.ttf`:

```sparkdown
style textbox {
  text-font = "title"
}
```

Renaming the family's font, or the file `title.ttf`, renames its `@` style files with it, and Find References on the family lists them.

A name such as `title__bold.ttf` is not a style. It is a separate font named `title__bold`; rename it to `title@bold.ttf` to make it the bold file of `title`.
