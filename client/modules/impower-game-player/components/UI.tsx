import React, { useEffect, useMemo, useState } from "react";
import {
  ConstructData,
  FillType,
  UIElementData,
} from "../../impower-game/data";
import { useGameStyle } from "../hooks/gameHooks";
import { PhaserGame } from "../types/game/phaserGame";
import { ConstructComponent } from "./ConstructComponent";

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
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 3 }}></div>
          <div
            style={{
              flex: 1,
              backgroundColor: "white",
              paddingTop: 32,
              paddingBottom: 32,
            }}
          >
            <div
              id="impower-ui-display"
              style={{
                marginLeft: "auto",
                marginRight: "auto",
                width: "68%",
                fontFamily: "Courier Prime Sans",
                fontSize: "1.25rem",
                whiteSpace: "pre-wrap",
              }}
            >
              <div
                className="character"
                style={{
                  marginBottom: 0,
                  marginLeft: "23%",
                }}
              />
              <div
                className="parenthetical"
                style={{
                  marginTop: 0,
                  marginBottom: 0,
                  marginLeft: "11%",
                }}
              />
              <div
                className="content"
                style={{
                  marginTop: 0,
                  marginBottom: 0,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UI;
