import { CSSProperties, useEffect, useState } from "react";
import { PhaserGame } from "../types/game/phaserGame";

export const useGameStyle = (phaserGame?: PhaserGame): CSSProperties => {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (phaserGame) {
      const onResize = (): void => {
        if (phaserGame.canvas) {
          const newStyle: CSSProperties = {
            width: phaserGame.canvas.style.width,
            height: phaserGame.canvas.style.height,
            marginLeft: phaserGame.canvas.style.marginLeft,
            marginTop: phaserGame.canvas.style.marginTop,
          };
          setStyle(newStyle);
        }
      };

      onResize();
      phaserGame.scale.addListener("resize", onResize, {
        passive: true,
      });
      return (): void => {
        phaserGame.scale.removeListener("resize", onResize);
      };
    }
    return undefined;
  }, [phaserGame]);

  return style;
};
