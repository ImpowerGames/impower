import {
  Activable,
  Color,
  Nameable,
  Optional,
  UnitNumberData,
} from "../../../../../../../impower-core";
import { StorageType } from "../../../../../../data";
import {
  HorizontalAlignment,
  TextAlignment,
  VerticalAlignment,
} from "../../../../../../data/enums/alignment";
import {
  HorizontalAnchor,
  VerticalAnchor,
} from "../../../../../../data/enums/anchor";
import { ArrangementType } from "../../../../../../data/enums/arrangementType";
import { BlendMode } from "../../../../../../data/enums/blendMode";
import { BorderPosition } from "../../../../../../data/enums/borderPosition";
import { ElementContentType } from "../../../../../../data/enums/elementContentType";
import { FillType } from "../../../../../../data/enums/fillType";
import { GradientType } from "../../../../../../data/enums/gradientType";
import { ListDirection } from "../../../../../../data/enums/layoutDirection";
import { LayoutSize } from "../../../../../../data/enums/layoutSize";
import { ScrollbarType } from "../../../../../../data/enums/scrollbarType";
import { ShadowPosition } from "../../../../../../data/enums/shadowPosition";
import { Disableable } from "../../../../../../data/interfaces/disableable";
import { BlendingProps } from "../../../../../../data/interfaces/props/blendingProps";
import { BorderProps } from "../../../../../../data/interfaces/props/borderProps";
import { ContentProps } from "../../../../../../data/interfaces/props/contentProps";
import { FillProps } from "../../../../../../data/interfaces/props/fillProps";
import { GlowProps } from "../../../../../../data/interfaces/props/glowProps";
import { LayoutProps } from "../../../../../../data/interfaces/props/layoutProps";
import { PositionProps } from "../../../../../../data/interfaces/props/positionProps";
import { RadiusProps } from "../../../../../../data/interfaces/props/radiusProps";
import { ShadowProps } from "../../../../../../data/interfaces/props/shadowProps";
import { SizeProps } from "../../../../../../data/interfaces/props/sizeProps";
import { TextProps } from "../../../../../../data/interfaces/props/textProps";
import { TransformProps } from "../../../../../../data/interfaces/props/transformProps";
import { isElementReference } from "../../../../../../data/interfaces/references/elementReference";
import { FileTypeId } from "../../../file/fileTypeId";
import { ElementData } from "../../element/elementData";
import { ElementTypeId } from "../../element/elementTypeId";

export interface UIElementProps {
  position: Optional<PositionProps>;
  size: Optional<SizeProps>;
  radius: RadiusProps;
  transform: TransformProps;
  layout: LayoutProps;
  text: Activable<TextProps>;
  fill: Activable<FillProps>;
  border: Activable<BorderProps>;
  shadow: Activable<ShadowProps>;
  glow: Activable<GlowProps>;
  blending: Activable<BlendingProps>;
}

export interface UIElementComponentData
  extends UIElementProps,
    Nameable,
    Disableable {
  key: string;
  group: boolean;
  content: {
    type: ElementContentType;
    text: string;
    component: UIElementComponentData[];
  };
}

export interface UIElementData<T extends ElementTypeId = ElementTypeId>
  extends ElementData<T>,
    Nameable,
    UIElementProps {
  group: boolean;
  content: ContentProps;
}

export const isUIElementData = <T extends ElementTypeId = ElementTypeId>(
  obj: unknown
): obj is UIElementData<T> => {
  if (!obj) {
    return false;
  }
  const uiElementData = obj as UIElementData<T>;
  return (
    isElementReference(uiElementData.reference) &&
    uiElementData.group !== undefined &&
    uiElementData.content !== undefined &&
    uiElementData.position !== undefined &&
    uiElementData.size !== undefined &&
    uiElementData.radius !== undefined &&
    uiElementData.transform !== undefined &&
    uiElementData.layout !== undefined &&
    uiElementData.text !== undefined &&
    uiElementData.fill !== undefined &&
    uiElementData.border !== undefined &&
    uiElementData.shadow !== undefined &&
    uiElementData.glow !== undefined &&
    uiElementData.blending !== undefined
  );
};

export const createUIElementProps = (): UIElementProps => ({
  position: {
    useDefault: true,
    value: {
      verticalAnchor: VerticalAnchor.TopAndBottom,
      horizontalAnchor: HorizontalAnchor.LeftAndRight,
      top: { value: 0, unit: "Pixels" },
      bottom: { value: 0, unit: "Pixels" },
      left: { value: 0, unit: "Pixels" },
      right: { value: 0, unit: "Pixels" },
    },
  },
  size: {
    useDefault: true,
    value: {
      width: { value: 0, unit: "Pixels" },
      height: { value: 0, unit: "Pixels" },
    },
  },
  radius: {
    topLeft: { value: 0, unit: "Pixels" },
    topRight: { value: 0, unit: "Pixels" },
    bottomRight: { value: 0, unit: "Pixels" },
    bottomLeft: { value: 0, unit: "Pixels" },
  },
  transform: {
    rotation: 0,
    offset: {
      x: 0,
      y: 0,
    },
    scale: {
      x: 1,
      y: 1,
    },
    skew: {
      x: 0,
      y: 0,
    },
    origin: {
      x: { value: 50, unit: "Percentage" },
      y: { value: 50, unit: "Percentage" },
    },
  },
  layout: {
    childArrangement: ArrangementType.List,
    direction: ListDirection.Column,
    width: LayoutSize.Auto,
    height: LayoutSize.Auto,
    verticalAlignment: VerticalAlignment.Stretch,
    horizontalAlignment: HorizontalAlignment.Stretch,
    spaceAround: 8,
    spaceBetween: 8,
    minColumnCount: { active: true, value: 3 },
    minRowCount: { active: true, value: 3 },
    verticalScrollbar: ScrollbarType.Auto,
    horizontalScrollbar: ScrollbarType.Auto,
  },
  text: {
    active: false,
    value: {
      fontFamily: "Open Sans",
      alignment: TextAlignment.Center,
      size: 16,
      lineHeight: 1,
      letterSpacing: 0,
      wrap: true,
    },
  },
  fill: {
    active: false,
    value: {
      type: FillType.Solid,
      gradientType: GradientType.Linear,
      color: { h: 0, s: 0, l: 0.5, a: 0.5 },
      gradientAngle: 0,
      gradientColorStops: {
        default: {
          color: { h: 0, s: 0, l: 1, a: 1 },
          position: { unit: "Percentage", value: 100 },
        },
        order: ["end"],
        data: {
          end: {
            color: { h: 0, s: 0, l: 1, a: 1 },
            position: { unit: "Percentage", value: 100 },
          },
        } as { [refId: string]: { color: Color; position: UnitNumberData } },
      },
      image: {
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      },
    },
  },
  border: {
    active: false,
    value: {
      color: { h: 0, s: 0, l: 1, a: 1 },
      position: BorderPosition.Inside,
      size: 1,
    },
  },
  shadow: {
    active: false,
    value: {
      position: ShadowPosition.Outside,
      elevation: 0,
    },
  },
  glow: {
    active: false,
    value: {
      position: ShadowPosition.Outside,
      color: { h: 0, s: 0, l: 1, a: 0.5 },
      blur: 8,
      spread: 0,
      x: 0,
      y: 0,
    },
  },
  blending: {
    active: false,
    value: {
      opacity: 1,
      mode: BlendMode.Normal,
    },
  },
});
