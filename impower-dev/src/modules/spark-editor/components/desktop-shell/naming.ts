import { useCoarsePointer, useLayout } from "@impower/impower-ui/layout";
import { signal } from "@preact/signals";
import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { storyScriptOf } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { withWindow } from "./workspaceWindow";

export type NamingField = "project" | "script";

const namingField = signal<NamingField | null>(null);

export function useNaming(): NamingField | null {
  return namingField.value;
}

const TEXT_FIELD =
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"]), textarea, [contenteditable]:not([contenteditable="false"])';

const TAKES_FOCUS = `${TEXT_FIELD}, select, label, a[href], nav, [role="tab"], [aria-haspopup="menu"], input[type="range"]`;

const deepActiveElement = (): Element | null => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
};

export function finishNaming() {
  const active = deepActiveElement();
  if (active instanceof HTMLElement && active.matches("[data-name-field]")) {
    active.blur();
  }
}

export function useFocusRule() {
  const phone = useLayout() === "phone";
  const coarse = useCoarsePointer();
  const active = phone || coarse;

  useEffect(() => {
    if (!active) {
      return;
    }
    const keepFocus = (event: Event) => {
      const focused = deepActiveElement();
      if (!focused?.matches(TEXT_FIELD)) {
        return;
      }
      const path = event.composedPath();
      const target = path[0];
      if (focused.matches("[data-name-field]")) {
        if (
          !path.includes(focused) &&
          focused instanceof HTMLElement &&
          !(target instanceof Element && target.closest(TAKES_FOCUS))
        ) {
          focused.blur();
        }
        return;
      }
      if (target instanceof Element && target.closest(TAKES_FOCUS)) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("pointerdown", keepFocus, true);
    return () => document.removeEventListener("pointerdown", keepFocus, true);
  }, [active]);
}

type CloseWatcherLike = { onclose: (() => void) | null; destroy: () => void };

export const closeWatcher = (onClose: () => void): (() => void) | undefined => {
  const Watcher = (globalThis as { CloseWatcher?: new () => CloseWatcherLike })
    .CloseWatcher;
  if (!Watcher) {
    return undefined;
  }
  const watcher = new Watcher();
  watcher.onclose = onClose;
  return () => watcher.destroy();
};

export type NameFieldOptions = {
  field: NamingField;
  name: string;
  onFocus?: () => void;
  onCommit: (value: string) => Promise<string | undefined>;
};

export function useNameField({
  field,
  name,
  onFocus,
  onCommit,
}: NameFieldOptions) {
  const [draft, setDraft] = useState(name);
  const restoring = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const naming = namingField.value === field;

  useLayoutEffect(() => {
    setDraft(name);
  }, [name]);

  const restore = () => {
    restoring.current = true;
    setDraft(name);
    input.current?.blur();
  };
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(
    () => (naming ? closeWatcher(() => restoreRef.current()) : undefined),
    [naming],
  );

  useEffect(
    () => () => {
      if (namingField.peek() === field) {
        namingField.value = null;
      }
    },
    [field],
  );

  const props = {
    ref: input,
    value: draft,
    "data-name-field": field,
    onInput: (e: JSX.TargetedEvent<HTMLInputElement>) =>
      setDraft(e.currentTarget.value),
    onFocus: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
      restoring.current = false;
      e.currentTarget.select();
      namingField.value = field;
      onFocus?.();
    },
    onBlur: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
      const value = restoring.current ? name : e.currentTarget.value;
      restoring.current = false;
      if (namingField.peek() === field) {
        namingField.value = null;
      }
      if (
        !e.relatedTarget &&
        workspace.effectiveScriptMode.peek() === "editing"
      ) {
        const script = storyScriptOf();
        if (script) {
          withWindow((win) => win.executeEditorCommand(script, "focus"));
        }
      }
      void onCommit(value).then((shown) => {
        if (shown !== undefined) {
          setDraft(shown);
        }
      });
    },
    onKeyDown: (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.isComposing || e.keyCode === 229) {
          return;
        }
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        restore();
      }
    },
  };

  return { naming, draft, props };
}
