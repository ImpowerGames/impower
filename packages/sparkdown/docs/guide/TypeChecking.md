# 12. Type Checking

The editor checks the Luau in your scripts with Luau's own type checker and shows what it finds as warnings: a number passed where a function expects a string, a name that is never declared, a value that can never be what its annotation says. A warning never stops your story from running.

## Modes

There are three modes, as in Luau:

- `nonstrict`, the default, warns only about what is certainly wrong, such as a name nothing declares.
- `strict` also works out the types of the code you did not annotate, and warns about every mismatch.
- `nocheck` checks nothing.

## Choosing a mode

For the whole project, set it with a `define`:

```sparkdown
define typecheck as config with
  mode = "strict"
end
```

For one script, write it in the script's front matter, between the `---` lines at its top:

```sparkdown
---
title: The Heist
typecheck: strict
---
```

A script's front matter applies to that script, in place of the project's `define`. A mode the editor does not know is warned about where you wrote it, and ignored.

## An example

```sparkdown
---
typecheck: strict
---

function greet(name: string): string
  return "Hi " .. name
end

scene start
  local label: string = greet(42)
end
```

The editor underlines `42`, with the warning "Expected this to be 'string', but got 'number'".

## What is not checked

- A name you declare in Sparkdown (a scene, a `define`, a `store`, a function in another file) is accepted wherever you use it, as any type.
- Sparkdown's own expressions, such as `plural(n)|one="is"|other="are"` or `-> start`, are accepted as any type too.
