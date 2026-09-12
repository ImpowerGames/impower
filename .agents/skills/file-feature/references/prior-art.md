# Research relevant prior art

All commands run from the worktree root unless stated otherwise.

## 2. Prior art

Almost nothing this project builds is a new concept. A narrative engine, a scripting language, a user-interface layout language, a code editor, an asset manager: each has peers that have already met the edge cases and settled on conventions their users expect. Before the interview, name two to four systems that solve the same problem and work out how each one handles it. This is where the questions nobody thought to ask come from, and it is what keeps the engine intuitive to someone arriving from one of those tools.

The usual comparison points here:

- Narrative scripting: Ren'Py, Ink, Twine, Yarn Spinner. Syntax, directives, scene and choice semantics, save and rollback behavior.
- Engines: Godot, Unity, Unreal. Asset loading and lifetime, scene transitions, animation, input, the split between edit-time and run-time behavior.
- UI markup and templating: JSX and React, Svelte, Vue single-file components, Pug, Handlebars, Ren'Py's screen language, Unity's UXML, Qt's QML, SwiftUI. How a component is declared, named, nested, and reused; how a template writes a loop, a conditional, or a slot for caller-supplied content; how values are passed in and events come back out.
- Styling and reactivity: CSS and its cascade, Tailwind, Svelte's and Vue's scoped styles, Unity's USS, and the signal or observable systems in Svelte, Solid, and Vue. What a selector can match, how a style is scoped to one component rather than the whole screen, which properties animate and how transitions are declared, and how a displayed value stays in sync when the data behind it changes.
- Editors and extensions: VS Code, and the editor features authors already know from it. Panels, commands, find and replace, diagnostics.
- Files, sync, collaboration, and history: Google Drive and Google Docs, GitHub, Dropbox, Figma. Project and file management, offline and multi-device syncing, conflict handling, real-time collaboration and presence, version history, and the sharing and permission model authors expect.
- Screenplay conventions: Fountain and the screenwriting tools built on it, for anything about how a script reads on the page.

For each, write down how it handles the surface, the semantics, and the edge cases in a few lines, and where they disagree with each other, because a disagreement between mature systems marks a real decision the interview has to put to the user. Draw on what you already know first; that covers most of it. Read the system's documentation only where a specific claim is going into a recommendation or where you are unsure, since exact statement names, signatures, and behavior that changed in a recent version are what recalled knowledge gets wrong. Cite the source when a claim is specific.

Prior art informs the recommendation; it does not decide it. The answer still has to fit this project's own conventions and its author's problem, and "Ren'Py does it this way" is a reason to consider a design, not a reason to adopt it. Keep this step to a short list you feed into the interview rather than a report of its own; the point is to seed the recommended answers and the edge-case questions, and the comparisons then land in the ticket under Alternatives considered.
