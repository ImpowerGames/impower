import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import React, { useCallback, useEffect, useState } from "react";
import GripLinesVerticalSolidIcon from "../../../../resources/icons/solid/grip-lines-vertical.svg";
import PlusSolidIcon from "../../../../resources/icons/solid/plus.svg";
import UploadSolidIcon from "../../../../resources/icons/solid/upload.svg";
import format from "../../../impower-config/utils/format";
import {
  addOrderedCollectionData,
  getPropertyName,
  getValue,
  isIdentifiable,
  isNameable,
  isStorageFile,
  List,
  removeOrderedCollectionData,
  setOrderedCollectionOrder,
} from "../../../impower-core";
import { FontIcon } from "../../../impower-icon";
import { layout } from "../../styles/layout";
import DataField, { RenderPropertyProps } from "./DataField";
import DataList from "./DataList";
import { getChildrenProps } from "./ObjectField";

const StyledListInput = styled.div`
  position: relative;
  margin-left: -${(props): string => props.theme.spacing(8)};
  .inset & {
    color: white;
  }
`;

const StyledListBottomToolbar = styled.div`
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-height: ${(props): string => props.theme.spacing(6)};
`;

const StyledListItemArea = styled.div`
  position: relative;
`;

const StyledListItemBackground = styled.div`
  position: absolute;
  left: -${(props): string => props.theme.spacing(8)};
  right: 0;
  top: 0;
  bottom: 0;
`;

const StyledListItemHandle = styled.div`
  pointer-events: auto;
  position: absolute;
  left: -${(props): string => props.theme.spacing(8)};
  top: 0;
  bottom: 0;
  width: ${(props): string => props.theme.spacing(8)};
  padding-left: ${(props): string => props.theme.spacing(3)};
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.3;
`;

const StyledInput = styled.input`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: -${(props): string => props.theme.spacing(1)};
  margin-right: -${(props): string => props.theme.spacing(1)};
  margin-top: -${(props): string => props.theme.spacing(1)};
  margin-bottom: -${(props): string => props.theme.spacing(1)};
  display: none;
`;

const StyledLabel = styled.label`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: -${(props): string => props.theme.spacing(1)};
  margin-right: -${(props): string => props.theme.spacing(1)};
  margin-top: -${(props): string => props.theme.spacing(1)};
  margin-bottom: -${(props): string => props.theme.spacing(1)};
  border-radius: inherit;
  cursor: pointer;
`;

const StyledButton = styled(Button)`
  border-radius: inherit;
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

interface ListInputProps extends RenderPropertyProps {
  propertyValue: List;
  virtualize?: boolean;

  renderProperty?: (props: RenderPropertyProps) => React.ReactNode;
  renderPropertyProps?: Record<string, unknown>;
}

const ListInput = (props: ListInputProps): JSX.Element => {
  const {
    propertyValue,
    propertyPath,
    data,
    variant,
    inset,
    listCountLimit,
    label,
    blob,
    disableListReordering,
    indent,
    indentAmount,
    spacing,
    disallowExternalFiles,
    backgroundColor,
    virtualize,
    disabled,
    onExpandProperty,
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
    getFormattedSummary = format,
    getInspector,
    setValueId,
  } = props;

  const childrenProps = getChildrenProps(props);

  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [draggingFile, setDraggingFile] = useState(false);
  const [pointerDown, setPointerDown] = useState(false);
  const [blobs, setBlobs] = useState<{ [id: string]: globalThis.File }>();

  const paddingLeft = indent * indentAmount;
  const theme = useTheme();
  const itemSize = layout.size.minHeight.dataField + 8;

  const inspectedData = data[0];
  const count = propertyValue.order.length;
  const defaultElement = propertyValue.default;
  const usingStorageOnly =
    isStorageFile(defaultElement) && disallowExternalFiles;

  const getSearchTargets = useCallback(
    (id: string): string[] => {
      const v = propertyValue.data[id];
      return [isNameable(v) ? v.name : ""];
    },
    [propertyValue.data]
  );
  const handleAddListData = useCallback(
    (ids: string[]): void => {
      let newList = propertyValue;
      ids.forEach((id) => {
        const newDefaultElement =
          setValueId(defaultElement, id) || defaultElement;
        if (isIdentifiable(newDefaultElement)) {
          newDefaultElement.id = id;
        }
        newList = {
          ...addOrderedCollectionData(newList, newDefaultElement, id),
          default: propertyValue.default,
        };
        onExpandProperty(`${propertyPath}.data.${id}`, true);
      });
      onPropertyInputChange(propertyPath, newList);
      onPropertyChange(propertyPath, newList);
      onDebouncedPropertyChange(propertyPath, newList);
    },
    [
      defaultElement,
      onDebouncedPropertyChange,
      onExpandProperty,
      onPropertyInputChange,
      onPropertyChange,
      propertyPath,
      propertyValue,
      setValueId,
    ]
  );
  const handleRemoveListData = useCallback(
    (id: string): void => {
      const newList = removeOrderedCollectionData(propertyValue, [id]);
      onPropertyInputChange(propertyPath, newList);
      onPropertyChange(propertyPath, newList);
      onDebouncedPropertyChange(propertyPath, newList);
    },
    [
      propertyValue,
      propertyPath,
      onPropertyInputChange,
      onPropertyChange,
      onDebouncedPropertyChange,
    ]
  );
  const handleSetOrder = useCallback(
    (ids: string[]): void => {
      const newList = setOrderedCollectionOrder(propertyValue, ids);
      onPropertyInputChange(propertyPath, newList);
      onPropertyChange(propertyPath, newList);
      onDebouncedPropertyChange(propertyPath, newList);
    },
    [
      propertyValue,
      propertyPath,
      onPropertyInputChange,
      onPropertyChange,
      onDebouncedPropertyChange,
    ]
  );
  const handleItemPropertyInputChange = useCallback(
    (itemPropertyPath: string, value: unknown) => {
      if (isStorageFile(value) && usingStorageOnly && !value.storageKey) {
        handleRemoveListData(getPropertyName(itemPropertyPath));
      } else {
        onPropertyInputChange(itemPropertyPath, value);
      }
    },
    [usingStorageOnly, handleRemoveListData, onPropertyInputChange]
  );
  const handleItemPropertyChange = useCallback(
    (itemPropertyPath: string, value: unknown) => {
      if (isStorageFile(value) && usingStorageOnly && !value.storageKey) {
        handleRemoveListData(getPropertyName(itemPropertyPath));
      } else {
        onPropertyChange(itemPropertyPath, value);
      }
    },
    [usingStorageOnly, handleRemoveListData, onPropertyChange]
  );
  const handleItemDebouncedPropertyChange = useCallback(
    (itemPropertyPath: string, value: unknown) => {
      if (isStorageFile(value) && usingStorageOnly && !value.storageKey) {
        handleRemoveListData(getPropertyName(itemPropertyPath));
      } else {
        onDebouncedPropertyChange(itemPropertyPath, value);
      }
    },
    [usingStorageOnly, handleRemoveListData, onDebouncedPropertyChange]
  );
  const handleUploadFiles = useCallback(
    async (files: FileList): Promise<void> => {
      const getUuid = (await import("../../../impower-core/utils/getUuid"))
        .default;
      const newBlobs = { ...blobs };
      const ids: string[] = [];
      Array.from(files).forEach((blob) => {
        const id = getUuid();
        ids.push(id);
        newBlobs[id] = blob;
      });
      handleAddListData(ids);
      setBlobs(newBlobs);
    },
    [blobs, handleAddListData]
  );
  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDragEnter = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDraggingFile(true);
    }
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDraggingFile(false);
    }
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingFile(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleUploadFiles(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    },
    [handleUploadFiles]
  );
  const handleClickAdd = useCallback(async () => {
    if (!isStorageFile(defaultElement)) {
      const getUuid = (await import("../../../impower-core/utils/getUuid"))
        .default;
      handleAddListData([getUuid()]);
    }
  }, [defaultElement, handleAddListData]);

  useEffect(() => {
    const handlePointerUp = (): void => setPointerDown(false);
    window.addEventListener("pointerup", handlePointerUp);
    return (): void => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });
  useEffect(() => {
    if (draggingIds.length === 0) {
      setPointerDown(false);
    }
  }, [draggingIds]);

  return (
    <StyledListInput className={inset ? "inset" : variant}>
      <DataList
        virtualize={virtualize}
        disableReordering={disabled || disableListReordering}
        list={propertyValue}
        itemSize={itemSize}
        draggingIds={draggingIds}
        selectedIds={[]}
        search={null}
        style={{ paddingLeft: paddingLeft + 64 }}
        onSetDragging={setDraggingIds}
        onSetOrder={handleSetOrder}
        onSetSelection={(): void => null}
        getSearchTargets={getSearchTargets}
      >
        {({ id, index, value, onDragHandleTrigger }): JSX.Element => {
          const dragging = draggingIds.includes(id);
          const itemPath = `${propertyPath}.data.${id}`;
          const itemValue = getValue(inspectedData, itemPath);
          const inspector = getInspector?.(inspectedData);
          const arrayValuePropertyLabel =
            isNameable(itemValue) && itemValue.name
              ? itemValue.name
              : inspector.getPropertyLabel(
                  `${propertyPath}.data.${id}`,
                  inspectedData
                );
          const arrayValueLabel = getFormattedSummary(
            arrayValuePropertyLabel,
            inspectedData
          );
          const itemLabel =
            isNameable(itemValue) && itemValue.name
              ? itemValue.name
              : arrayValueLabel;

          return (
            <StyledListItemArea
              style={{
                color: backgroundColor ? "white" : undefined,
              }}
            >
              <StyledListItemBackground
                style={{
                  backgroundColor: dragging
                    ? backgroundColor
                      ? "black"
                      : "white"
                    : undefined,
                }}
              />
              <DataField
                key={id}
                {...childrenProps}
                label={itemLabel}
                autoFocus={
                  index === count - 1 && value === propertyValue.default
                }
                propertyPath={`${propertyPath}.data.${id}`}
                moreIcon={usingStorageOnly ? null : "trash-alt"}
                moreTooltip="Remove"
                moreIconSize={theme.fontSize.addRemoveIcon}
                blob={blobs?.[id] || blob}
                onMore={handleRemoveListData}
                onPropertyInputChange={handleItemPropertyInputChange}
                onPropertyChange={handleItemPropertyChange}
                onDebouncedPropertyChange={handleItemDebouncedPropertyChange}
              />
              {!disableListReordering && (
                <StyledListItemHandle
                  onPointerDown={(e): void => {
                    setPointerDown(true);
                    onDragHandleTrigger(e);
                  }}
                  style={{
                    color: backgroundColor,
                    cursor: pointerDown ? "grabbing" : "grab",
                    opacity: dragging ? 1 : undefined,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  <FontIcon
                    aria-label="Drag to reorder"
                    size={theme.fontSize.smallIcon}
                  >
                    <GripLinesVerticalSolidIcon />
                  </FontIcon>
                </StyledListItemHandle>
              )}
            </StyledListItemArea>
          );
        }}
      </DataList>
      <StyledListBottomToolbar
        style={{
          paddingTop: spacing * 0.5,
          paddingLeft: paddingLeft + 64,
          paddingRight: usingStorageOnly
            ? undefined
            : theme.minWidth.headerIcon,
        }}
      >
        <StyledButton
          variant="outlined"
          color="inherit"
          disabled={count >= listCountLimit}
          fullWidth
          onClick={handleClickAdd}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            borderStyle: draggingFile ? "dashed" : undefined,
          }}
        >
          <StyledButtonIconArea>
            <FontIcon aria-label="Add" size={theme.fontSize.addRemoveIcon}>
              {draggingFile ? <UploadSolidIcon /> : <PlusSolidIcon />}
            </FontIcon>
          </StyledButtonIconArea>
          {format("Add {target}", {
            target: label,
          })}
          {isStorageFile(defaultElement) && usingStorageOnly && (
            <>
              <StyledInput
                accept={defaultElement.fileType}
                id={`${propertyPath}-mini-preview-input`}
                type="file"
                multiple
                onChange={(e): void => {
                  if (
                    !e ||
                    !e.target ||
                    !e.target.files ||
                    e.target.files.length === 0
                  ) {
                    return;
                  }
                  handleUploadFiles(e.target.files);
                }}
              />
              <StyledLabel htmlFor={`${propertyPath}-mini-preview-input`} />
            </>
          )}
        </StyledButton>
      </StyledListBottomToolbar>
    </StyledListInput>
  );
};

export default ListInput;
