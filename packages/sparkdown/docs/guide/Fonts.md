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

The family is the text before the `@`. The style after it is `bold`, `italic`, `bolditalic` or `italicbold`, in any letter case. Scripts and styles name the family only, and the engine picks the file that matches the text's weight and style:

```sparkdown
style main {
  text-font = "title"
}
```

Renaming the family's font, or the file `title.ttf`, renames its `@` style files with it.

A name such as `title__bold.ttf` is not a style. It is a separate font named `title__bold`; rename it to `title@bold.ttf` to make it the bold file of `title`.
