import { getLabel } from "../../../../../../../impower-config";
import { getParentPropertyPath } from "../../../../../../../impower-core";
import {
  ArrangementType,
  BlendMode,
  BorderPosition,
  ContainerType,
  createDynamicData,
  createUIElementProps,
  ElementContentType,
  ElementTypeId,
  FillType,
  GradientType,
  GridDirection,
  HorizontalAlignment,
  HorizontalAnchor,
  LayoutSize,
  ListDirection,
  ScrollbarType,
  ShadowPosition,
  TextAlignment,
  TypeInfo,
  UIElementData,
  VerticalAlignment,
  VerticalAnchor,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { ElementInspector } from "../../element/elementInspector";

export class UIElementInspector<
  T extends ElementTypeId = ElementTypeId
> extends ElementInspector<UIElementData<T>> {
  getTypeInfo(data?: UIElementData<T>): TypeInfo {
    if (!data) {
      return {
        category: "",
        name: "UI Element",
        icon: "shapes",
        color: getProjectColor("teal", 5),
        description: "",
      };
    }
    return {
      category: "",
      name: data.group
        ? "Group"
        : data.content.type === ElementContentType.Component
        ? "Component"
        : data.content.type === ElementContentType.Text
        ? "Text"
        : data.fill.active && data.fill.value.type === FillType.Image
        ? "Image"
        : "Shape",
      icon: data.group
        ? "layer-group"
        : data.content.type === ElementContentType.Component
        ? "puzzle-piece"
        : data.content.type === ElementContentType.Text
        ? "text"
        : data.fill.active && data.fill.value.type === FillType.Image
        ? "image"
        : "square",
      color: data.group
        ? getProjectColor("yellow", 5)
        : data.content.type === ElementContentType.Component
        ? getProjectColor("grape", 5)
        : data.content.type === ElementContentType.Text
        ? getProjectColor("blue", 5)
        : data.fill.active && data.fill.value.type === FillType.Image
        ? getProjectColor("pink", 5)
        : getProjectColor("teal", 5),
      description: "",
    };
  }

  getSummary(data: UIElementData<T>): string {
    if (data.group) {
      return `${super.getSummary(data)} {`;
    }
    return super.getSummary(data);
  }

  createData(
    data?: Partial<UIElementData<T>> & Pick<UIElementData<T>, "reference">
  ): UIElementData<T> {
    return {
      ...super.createData(data),
      name: "NewElement",
      group: false,
      content: {
        type: ElementContentType.None,
        text: createDynamicData("Type Something"),
        component: createDynamicData({
          refType: ContainerType.Construct,
          refTypeId: ContainerType.Construct,
          refId: "",
        }),
      },
      ...createUIElementProps(),
      ...data,
    };
  }

  validate(data: UIElementData<T>): UIElementData<T> {
    const refTypeId = (
      data.group
        ? ElementTypeId.GroupElement
        : data.content?.type === ElementContentType.Component
        ? ElementTypeId.ComponentElement
        : data.content?.type === ElementContentType.Text
        ? ElementTypeId.TextElement
        : data.fill?.active && data.fill?.value.type === FillType.Image
        ? ElementTypeId.ImageElement
        : ElementTypeId.ShapeElement
    ) as T;
    if (data.reference.refTypeId !== refTypeId) {
      return {
        ...data,
        reference: {
          ...data.reference,
          refTypeId,
        },
      };
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: UIElementData<T>): string {
    if (
      getParentPropertyPath(propertyPath) ===
      "fill.value.gradientColorStops.data"
    ) {
      return "Color";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyOptions(propertyPath: string, data?: UIElementData<T>): unknown[] {
    if (propertyPath === "content.type") {
      return Object.values(ElementContentType);
    }
    if (propertyPath === "position.value.verticalAnchor") {
      return Object.values(VerticalAnchor);
    }
    if (propertyPath === "position.value.horizontalAnchor") {
      return Object.values(HorizontalAnchor);
    }
    if (propertyPath === "radius.type") {
      return ["Pixels", "Percentage"];
    }
    if (propertyPath === "layout.childArrangement") {
      return Object.values(ArrangementType);
    }
    if (propertyPath === "layout.verticalScrollbar") {
      return Object.values(ScrollbarType);
    }
    if (propertyPath === "layout.horizontalScrollbar") {
      return Object.values(ScrollbarType);
    }
    if (propertyPath === "layout.direction") {
      if (data?.layout.childArrangement === ArrangementType.List) {
        return Object.values(ListDirection);
      }
      if (data?.layout.childArrangement === ArrangementType.Grid) {
        return Object.values(GridDirection);
      }
    }
    if (propertyPath === "layout.width") {
      return Object.values(LayoutSize);
    }
    if (propertyPath === "layout.height") {
      return Object.values(LayoutSize);
    }
    if (propertyPath === "layout.verticalAlignment") {
      return Object.values(VerticalAlignment);
    }
    if (propertyPath === "layout.horizontalAlignment") {
      return Object.values(HorizontalAlignment);
    }
    if (propertyPath === "text.value.alignment") {
      return Object.values(TextAlignment);
    }
    if (propertyPath === "fill.value.type") {
      return Object.values(FillType);
    }
    if (propertyPath === "fill.value.gradientType") {
      return Object.values(GradientType);
    }
    if (propertyPath === "border.value.position") {
      return Object.values(BorderPosition);
    }
    if (propertyPath === "shadow.value.position") {
      return Object.values(ShadowPosition);
    }
    if (propertyPath === "glow.value.position") {
      return Object.values(ShadowPosition);
    }
    if (propertyPath === "blending.value.mode") {
      return Object.values(BlendMode);
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: UIElementData<T>,
    value: unknown
  ): string {
    if (
      propertyPath === "content.type" ||
      propertyPath === "position.value.verticalAnchor" ||
      propertyPath === "position.value.horizontalAnchor" ||
      propertyPath === "radius.type" ||
      propertyPath === "layout.childArrangement" ||
      propertyPath === "layout.verticalScrollbar" ||
      propertyPath === "layout.horizontalScrollbar" ||
      propertyPath === "layout.direction" ||
      propertyPath === "layout.width" ||
      propertyPath === "layout.height" ||
      propertyPath === "layout.verticalAlignment" ||
      propertyPath === "layout.horizontalAlignment" ||
      propertyPath === "text.value.alignment" ||
      propertyPath === "fill.value.type" ||
      propertyPath === "fill.value.gradientType" ||
      propertyPath === "border.value.position" ||
      propertyPath === "shadow.value.position" ||
      propertyPath === "glow.value.position" ||
      propertyPath === "blending.value.mode"
    ) {
      return getLabel(value as string);
    }
    return undefined;
  }

  isPropertyVisible(propertyPath: string, data: UIElementData<T>): boolean {
    if (propertyPath === "content.text") {
      if (data.content.type !== ElementContentType.Text) {
        return false;
      }
    }
    if (propertyPath === "content.component") {
      if (data.content.type !== ElementContentType.Component) {
        return false;
      }
    }
    if (propertyPath === "position.value.top") {
      if (
        data.position.value.verticalAnchor !== VerticalAnchor.Top &&
        data.position.value.verticalAnchor !== VerticalAnchor.TopAndBottom
      ) {
        return false;
      }
    }
    if (propertyPath === "position.value.bottom") {
      if (
        data.position.value.verticalAnchor !== VerticalAnchor.Bottom &&
        data.position.value.verticalAnchor !== VerticalAnchor.TopAndBottom
      ) {
        return false;
      }
    }
    if (propertyPath === "position.value.left") {
      if (
        data.position.value.horizontalAnchor !== HorizontalAnchor.Left &&
        data.position.value.horizontalAnchor !== HorizontalAnchor.LeftAndRight
      ) {
        return false;
      }
    }
    if (propertyPath === "position.value.right") {
      if (
        data.position.value.horizontalAnchor !== HorizontalAnchor.Right &&
        data.position.value.horizontalAnchor !== HorizontalAnchor.LeftAndRight
      ) {
        return false;
      }
    }
    if (propertyPath === "disabled") {
      return false;
    }
    if (
      propertyPath === "layout.direction" ||
      propertyPath === "layout.width" ||
      propertyPath === "layout.height" ||
      propertyPath === "layout.verticalAlignment" ||
      propertyPath === "layout.horizontalAlignment" ||
      propertyPath === "layout.spaceAround" ||
      propertyPath === "layout.spaceBetween"
    ) {
      if (
        data.layout.childArrangement !== ArrangementType.List &&
        data.layout.childArrangement !== ArrangementType.Grid
      ) {
        return false;
      }
    }
    if (
      propertyPath === "layout.minColumnCount" ||
      propertyPath === "layout.minRowCount"
    ) {
      if (data.layout.childArrangement !== ArrangementType.Grid) {
        return false;
      }
    }
    if (propertyPath === "fill.value.color") {
      if (
        data.fill.value.type !== FillType.Solid &&
        data.fill.value.type !== FillType.Gradient
      ) {
        return false;
      }
    }
    if (
      propertyPath === "fill.value.gradientType" ||
      propertyPath === "fill.value.gradientAngle" ||
      propertyPath === "fill.value.gradientColorStops"
    ) {
      if (data.fill.value.type !== FillType.Gradient) {
        return false;
      }
    }
    if (propertyPath === "fill.value.image") {
      if (data.fill.value.type !== FillType.Image) {
        return false;
      }
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  getPropertyBounds(
    propertyPath: string,
    _data: UIElementData<T>
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "shadow.value.elevation") {
      return {
        min: 1,
        max: 24,
        step: null,
        marks: [
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
          { value: 4, label: "4" },
          { value: 6, label: "6" },
          { value: 8, label: "8" },
          { value: 12, label: "12" },
          { value: 16, label: "16" },
          { value: 24, label: "24" },
        ],
        force: true,
      };
    }
    if (propertyPath === "blending.value.opacity") {
      return {
        min: 0,
        max: 1,
        step: 0.05,
        force: true,
      };
    }
    return undefined;
  }
}
