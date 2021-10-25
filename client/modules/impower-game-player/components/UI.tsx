import React, { useEffect, useState, useMemo } from "react";
import {
  ConstructData,
  FillType,
  UIElementData,
} from "../../impower-game/data";
import { ConstructComponent } from "./ConstructComponent";
import { PhaserGame } from "../types/game/phaserGame";
import { useGameStyle } from "../hooks/gameHooks";

interface UIProps {
  phaserGame: PhaserGame;
}

const UI = (props: UIProps): JSX.Element => {
  const { phaserGame } = props;

  const style = useGameStyle(phaserGame);

  const [loadedConstructs, setLoadedConstructs] = useState<ConstructData[]>(
    phaserGame.impowerGame
      ? phaserGame.impowerGame.entity.state.loadedConstructs.map(
          (id) => phaserGame.project?.instances?.constructs.data[id]
        )
      : []
  );

  const impowerDataMap = useMemo(() => phaserGame.impowerDataMap, [phaserGame]);

  useEffect(() => {
    // Clear the loadedConstructs from previous game runs
    const onClearPreviousConstructs = (): void => {
      if (phaserGame.impowerGame) {
        setLoadedConstructs([]);
      }
    };

    const onChangeLoadedConstructs = (): void => {
      if (phaserGame.impowerGame) {
        setLoadedConstructs(
          phaserGame.impowerGame.entity.state.loadedConstructs.map(
            (id) => phaserGame.project?.instances?.constructs.data[id]
          )
        );
      }
    };

    const onSetElementImage = (data: {
      imageRefId: string;
      constructRefId: string;
      elementRefId: string;
    }): void => {
      const { elementRefId, constructRefId, imageRefId } = data;

      if (phaserGame.impowerGame) {
        const element =
          phaserGame.project?.instances?.constructs.data[constructRefId]
            .elements.data[elementRefId];

        const currentFill = (element as UIElementData).fill;
        const newFill = {
          ...currentFill,
          value: {
            ...currentFill.value,
            type: FillType.Image,
            image: {
              ...currentFill.value.image,
              refId: imageRefId,
            },
          },
        };
        const newConstruct = {
          ...phaserGame.project?.instances?.constructs.data[constructRefId],
          elements: {
            ...phaserGame.project?.instances?.constructs.data[constructRefId]
              .elements,
            data: {
              [elementRefId]: {
                ...phaserGame.project?.instances?.constructs.data[
                  constructRefId
                ].elements.data[elementRefId],
                fill: newFill,
              },
            },
          },
        };

        setLoadedConstructs([newConstruct]);
      }
    };

    if (phaserGame.impowerGame) {
      phaserGame.impowerGame.entity.events.onLoadConstruct.addListener(
        onChangeLoadedConstructs
      );
      phaserGame.impowerGame.entity.events.onSetElementImage.addListener(
        onSetElementImage
      );
      phaserGame.impowerGame.entity.events.onUnloadConstruct.addListener(
        onChangeLoadedConstructs
      );
      phaserGame.impowerGame.entity.events.onClearPreviousConstructs.addListener(
        onClearPreviousConstructs
      );
    }
    return (): void => {
      if (phaserGame.impowerGame) {
        phaserGame.impowerGame.entity.events.onLoadConstruct.removeListener(
          onChangeLoadedConstructs
        );
        phaserGame.impowerGame.entity.events.onSetElementImage.removeListener(
          onSetElementImage
        );
        phaserGame.impowerGame.entity.events.onUnloadConstruct.removeListener(
          onChangeLoadedConstructs
        );
        phaserGame.impowerGame.entity.events.onClearPreviousConstructs.removeListener(
          onClearPreviousConstructs
        );
      }
    };
  });

  return (
    <div
      id="ui"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      <div id="ui-overlay" style={{ ...style, ...phaserGame.getUIStyle() }}>
        {Object.values(loadedConstructs).map(
          (construct) =>
            phaserGame.impowerGame && (
              <ConstructComponent
                key={construct.reference.refId}
                construct={construct}
                variables={impowerDataMap?.variables}
                constructs={impowerDataMap?.constructs}
                files={impowerDataMap?.files}
                game={phaserGame.impowerGame}
              />
            )
        )}
      </div>
    </div>
  );
};

export default UI;
