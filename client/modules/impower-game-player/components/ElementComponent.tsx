/* eslint-disable @typescript-eslint/no-use-before-define */
import React from "react";
import {
  getParentPositionStyle,
  getParentBorderRadiusStyle,
  getParentBackgroundColorStyle,
  getParentBackgroundImageStyle,
  getParentBackgroundImageSizeStyle,
  getParentBackgroundImageRepeatStyle,
  getParentBackgroundImagePositionStyle,
  getParentLayoutStyle,
  getParentTextStyle,
  getParentBorderStyle,
  getParentShadowStyle,
  getParentGlowStyle,
  getParentOpacityStyle,
  getParentMixBlendModeStyle,
  getChildLayoutStyle,
  getChildrenLayoutStyle,
  getParentTransformStyle,
  UIElementComponentData,
  createUIElementProps,
  ElementContentType,
} from "../../impower-game/data";

interface ElementGroup {
  parentElement: UIElementComponentData;
  childElements: UIElementComponentData[];
}

export const getGroups = (
  elements: UIElementComponentData[]
): ElementGroup[] => {
  const groups: ElementGroup[] = [];
  elements.forEach((element) => {
    if (element.group) {
      groups.push({ parentElement: element, childElements: [] });
    } else {
      let lastGroup = groups[groups.length - 1];
      if (!lastGroup) {
        lastGroup = {
          parentElement: {
            ...createUIElementProps(),
            name: "root",
            key: "root",
            disabled: false,
            group: true,
            content: {
              type: ElementContentType.None,
              text: "",
              component: [],
            },
          },
          childElements: [],
        };
        groups.push(lastGroup);
      }
      lastGroup.childElements.push(element);
    }
  });
  return groups;
};

interface ElementGroupComponentProps {
  parentElement: UIElementComponentData;
  childElements?: UIElementComponentData[];
  fileUrls: { [id: string]: string };
}

const ElementGroupComponent = React.memo(
  (props: ElementGroupComponentProps): JSX.Element => {
    const { fileUrls, parentElement, childElements = [] } = props;
    const {
      key,
      name,
      group,
      position,
      transform,
      size,
      radius,
      layout,
      text,
      fill,
      border,
      shadow,
      glow,
      blending,
      content,
    } = parentElement;
    const hasChildren = content.type !== ElementContentType.None || group;
    const parentStyle = {
      ...getParentPositionStyle(
        !position.useDefault ? position.value : undefined
      ),
      ...getParentTransformStyle(transform),
      ...getParentBorderRadiusStyle(radius),
      ...getParentLayoutStyle(
        layout,
        !size.useDefault ? size.value : undefined
      ),
      ...(text.active && getParentTextStyle(text.value)),
      ...(fill.active && getParentBackgroundColorStyle(fill.value)),
      ...(fill.active && getParentBackgroundImageStyle(fill.value, fileUrls)),
      ...(fill.active && getParentBackgroundImageSizeStyle()),
      ...(fill.active && getParentBackgroundImageRepeatStyle()),
      ...(fill.active && getParentBackgroundImagePositionStyle()),
      ...(border.active && getParentBorderStyle(border.value)),
      ...(shadow.active && getParentShadowStyle(shadow.value)),
      ...(glow.active && getParentGlowStyle(glow.value)),
      ...(blending.active && getParentOpacityStyle(blending.value)),
      ...(blending.active && getParentMixBlendModeStyle(blending.value)),
    };
    const childrenStyle = {
      ...getChildrenLayoutStyle(layout, hasChildren),
    };
    const childStyle = {
      ...getChildLayoutStyle(layout),
    };

    return (
      <div
        key={key}
        className={`${name}-parent`}
        style={parentStyle as React.CSSProperties}
      >
        <div
          className={`${name}-children`}
          style={childrenStyle as React.CSSProperties}
        >
          {(content.type === ElementContentType.Text ||
            content.type === ElementContentType.Component) && (
            <div
              className={`${name}-content`}
              style={childStyle as React.CSSProperties}
            >
              {content.type === ElementContentType.Text ? content.text : null}
              {content.type === ElementContentType.Component ? (
                <ElementComponent elements={content.component} />
              ) : null}
            </div>
          )}
          {childElements.map((child) => (
            <ElementGroupComponent
              key={child.name}
              parentElement={child}
              fileUrls={fileUrls}
            />
          ))}
        </div>
      </div>
    );
  }
);

interface ElementComponentProps {
  elements: UIElementComponentData[];
  fileUrls?: { [id: string]: string };
}
export const ElementComponent = React.memo(
  (props: ElementComponentProps): JSX.Element => {
    const { elements: children = [], fileUrls } = props;
    const groups = getGroups(children);
    return (
      <>
        {groups.map((group) => (
          <ElementGroupComponent
            key={group.parentElement.name}
            parentElement={group.parentElement}
            childElements={group.childElements}
            fileUrls={fileUrls}
          />
        ))}
      </>
    );
  }
);
