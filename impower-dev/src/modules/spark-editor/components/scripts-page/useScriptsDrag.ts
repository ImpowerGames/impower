import { useCoarsePointer } from "@impower/impower-ui/layout";
import { useEffect, useRef, useState } from "preact/hooks";
import { moveCheck, nameOf, type ScriptListing } from "../../workspace/scriptsListing";

const LONG_PRESS_MS = 500;
const SLOP_PX = 8;

export const DROP_FOLDER = "data-drop-folder";

export type ScriptsDragOptions = {
  listing: ScriptListing;
  carried: (path: string) => string[];
  onLongPress: (path: string) => void;
  onDrop: (paths: string[], folder: string) => void;
  onRefused: (message: string) => void;
};

type Press = {
  path: string;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
  armed: boolean;
  moved: boolean;
};

const folderAt = (element: EventTarget | Element | null): string | null => {
  const found =
    element instanceof Element ? element.closest(`[${DROP_FOLDER}]`) : null;
  return found ? found.getAttribute(DROP_FOLDER) : null;
};

const stopScroll = (event: TouchEvent) => event.preventDefault();

export function useScriptsDrag(options: ScriptsDragOptions) {
  const coarse = useCoarsePointer();
  const latest = useRef(options);
  latest.current = options;
  const [target, setTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const carried = useRef<string[] | null>(null);
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);

  const release = () => {
    if (press.current) {
      clearTimeout(press.current.timer);
      press.current = null;
    }
    document.removeEventListener("touchmove", stopScroll);
  };

  useEffect(() => release, []);

  const finish = () => {
    carried.current = null;
    setTarget(null);
    setDragging(false);
  };

  const check = (folder: string | null) =>
    carried.current && folder !== null
      ? moveCheck(latest.current.listing, carried.current, folder)
      : null;

  const hover = (folder: string | null) => {
    const result = check(folder);
    setTarget(result && "moving" in result && result.moving.length ? folder : null);
    return result;
  };

  const drop = (folder: string | null) => {
    const paths = carried.current;
    const result = check(folder);
    finish();
    if (!paths || !result) {
      return;
    }
    if ("refused" in result) {
      latest.current.onRefused(result.refused);
    } else if (result.moving.length) {
      latest.current.onDrop(paths, folder!);
    }
  };

  const source = (path: string) => ({
    draggable: !coarse,
    onDragStart: (event: DragEvent) => {
      carried.current = latest.current.carried(path);
      event.dataTransfer?.setData(
        "text/plain",
        carried.current.map(nameOf).join("\n"),
      );
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
      setTimeout(() => {
        if (carried.current) {
          setDragging(true);
        }
      });
    },
    onDragEnd: finish,
    onPointerDown: (event: PointerEvent) => {
      swallowClick.current = false;
      if (!coarse || event.button > 0) {
        return;
      }
      release();
      const pressed: Press = {
        path,
        x: event.clientX,
        y: event.clientY,
        armed: false,
        moved: false,
        timer: setTimeout(() => {
          pressed.armed = true;
          swallowClick.current = true;
          latest.current.onLongPress(path);
          carried.current = latest.current.carried(path);
          setDragging(true);
          document.addEventListener("touchmove", stopScroll, { passive: false });
        }, LONG_PRESS_MS),
      };
      press.current = pressed;
    },
    onPointerMove: (event: PointerEvent) => {
      const pressed = press.current;
      if (!pressed) {
        return;
      }
      if (!pressed.armed) {
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > SLOP_PX) {
          release();
        }
        return;
      }
      pressed.moved ||=
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > SLOP_PX;
      hover(folderAt(document.elementFromPoint?.(event.clientX, event.clientY) ?? null));
    },
    onPointerUp: (event: PointerEvent) => {
      const pressed = press.current;
      release();
      if (pressed?.armed && pressed.moved) {
        const folder = folderAt(
          document.elementFromPoint?.(event.clientX, event.clientY) ?? null,
        );
        if (folder !== null) {
          drop(folder);
        }
        finish();
      }
    },
    onPointerCancel: () => {
      release();
      finish();
    },
    onContextMenu: (event: MouseEvent) => {
      if (coarse) {
        event.preventDefault();
      }
    },
  });

  const area = {
    onDragOver: (event: DragEvent) => {
      if (!carried.current) {
        return;
      }
      const result = hover(folderAt(event.target));
      if (result) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (carried.current && folderAt(event.relatedTarget) === null) {
        setTarget(null);
      }
    },
    onDrop: (event: DragEvent) => {
      if (!carried.current) {
        return;
      }
      event.preventDefault();
      drop(folderAt(event.target));
    },
  };

  const clicked = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return false;
    }
    return true;
  };

  return { target, dragging, source, area, clicked };
}
