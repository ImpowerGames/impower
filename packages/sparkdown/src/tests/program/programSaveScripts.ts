// Scripts the save tests share with the process that writes a save for them
// (`programSaveWriter.ts`).

/** A tunnel's frame, called from a loop's body, whose owner inlines a
 *  constant: a position a save names is in the loop's body, and the frame
 *  returns inside the tunnel statement's code. */
export const LOOP_TUNNEL_SCRIPT = [
  "const K = 1",
  "store total = 0",
  "store fns = {}",
  "",
  "-> start",
  "",
  "scene early",
  "  Early.",
  "end",
  "",
  "scene helper",
  "  Inside {total}.",
  "  ->->",
  "end",
  "",
  "scene start",
  '  Begin {cycle|"a"|"b"}.',
  "  & fns.f = function() return total end",
  "  while total < K do",
  "    -> helper ->",
  "    total = total + 1",
  "  end",
  "  After {total} {fns.f()} {start}.",
  "end",
  "",
].join("\n");

/** The marker the writer prints its save after. */
export const SAVE_MARKER = "SAVE:";
