import React from "react";
import {
  ConstructData,
  FileData,
  isUIElementData,
  UIElementComponentData,
  UIElementData,
  VariableValue,
} from "../../impower-game/data";
import { ImpowerGame } from "../../impower-game/game";
import { getRuntimeValue } from "../../impower-game/runner";
import { ElementComponent } from "./ElementComponent";

const getElementComponentData = (
  data: UIElementData,
  game: ImpowerGame,
  variables?: { [id: string]: VariableValue },
  constructs?: { [refId: string]: ConstructData }
): UIElementComponentData => {
  const text = getRuntimeValue(data.content.text, variables, game);
  const constructReference = getRuntimeValue(
    data.content.component,
    variables,
    game
  );
  const construct =
    constructReference && constructs
      ? constructs[constructReference.refId]
      : undefined;
  return {
    ...data,
    name: data.name,
    key: data.reference.refId,
    disabled: data.disabled,
    group: data.group,
    content: {
      type: data.content.type,
      text,
      component: construct
        ? construct.elements.order
            .filter((id) => isUIElementData(construct.elements.data[id]))
            .map((id) =>
              getElementComponentData(
                construct.elements.data[id] as UIElementData,
                game,
                variables,
                constructs
              )
            )
        : [],
    },
  } as UIElementComponentData;
};

interface ConstructComponentProps {
  construct: ConstructData;
  game: ImpowerGame;
  variables?: { [refId: string]: VariableValue };
  constructs?: { [refId: string]: ConstructData };
  files?: { [refId: string]: FileData };
}

export const ConstructComponent = React.memo(
  (props: ConstructComponentProps): JSX.Element => {
    const { construct, game, variables, constructs, files } = props;
    const elements = construct.elements.order
      .filter((id) => isUIElementData(construct.elements.data[id]))
      .map((id) =>
        getElementComponentData(
          construct.elements.data[id] as UIElementData,
          game,
          variables,
          constructs
        )
      );

    const fileUrls = {};
    Object.entries(files).forEach(([key, value]) => {
      fileUrls[key] = value.fileUrl;
    });

    return <ElementComponent elements={elements} fileUrls={fileUrls} />;
  }
);
