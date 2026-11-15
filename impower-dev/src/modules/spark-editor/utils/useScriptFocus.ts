import { useEffect, useState } from "preact/hooks";
import { focusedElement } from "./focusedElement";

const scriptFocused = (): boolean =>
  typeof document !== "undefined" &&
  !!focusedElement()?.closest?.(".sparkdown-script-editor-root .cm-content");

export function useScriptFocus(): boolean {
  const [focused, setFocused] = useState(scriptFocused);
  useEffect(() => {
    const update = () => setFocused(scriptFocused());
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return focused;
}
