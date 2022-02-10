import { getUuid, getValue, isOrderedCollection } from "../../../impower-core";
import {
  InstanceData,
  isContainerData,
  isContainerReference,
  isInstanceData,
  isItemData,
  isItemReference,
  isReference,
  ParentLookup,
  Reference,
} from "../../data";

type Mutater = <T extends object>( // eslint-disable-line @typescript-eslint/ban-types
  object: T,
  path: string,
  value: unknown
) => void;

type Cloner = <T>(value: T) => T;

const getRemappedReference = <T extends Reference>(
  reference: T,
  idMap: { [refId: string]: string }
): T => {
  if (isContainerReference(reference)) {
    const parentContainerId =
      idMap[reference.parentContainerId] || reference.parentContainerId;
    const refId = idMap[reference.refId] || reference.refId;
    return { ...reference, parentContainerId, refId };
  }
  if (isItemReference(reference)) {
    const parentContainerId =
      idMap[reference.parentContainerId] || reference.parentContainerId;
    const refId = idMap[reference.refId] || reference.refId;
    return { ...reference, parentContainerId, refId };
  }
  if (isReference(reference)) {
    const refId = idMap[reference.refId] || reference.refId;
    return { ...reference, refId };
  }
  return reference;
};

const remapDataInternal = <T extends object>( // eslint-disable-line @typescript-eslint/ban-types
  data: T,
  idMap: { [refId: string]: string },
  mutateValue: Mutater
): void => {
  if (!data) {
    return;
  }

  if (isInstanceData(data)) {
    data.reference = getRemappedReference(data.reference, idMap);
  }

  if (isContainerData(data)) {
    const oldIds = [...data.childContainerIds];
    data.childContainerIds = [];
    oldIds.forEach((id) => {
      data.childContainerIds?.push(idMap[id] || id);
    });
  }

  Object.keys(data).forEach((propertyKey) => {
    const copiedPropertyValue = getValue(data, propertyKey);
    if (isContainerData(copiedPropertyValue)) {
      copiedPropertyValue.reference = getRemappedReference(
        copiedPropertyValue.reference,
        idMap
      );
    } else if (isItemData(copiedPropertyValue)) {
      copiedPropertyValue.reference = getRemappedReference(
        copiedPropertyValue.reference,
        idMap
      );
    } else if (isItemReference(copiedPropertyValue)) {
      mutateValue(
        data,
        propertyKey,
        getRemappedReference(copiedPropertyValue, idMap)
      );
    } else if (isContainerReference(copiedPropertyValue)) {
      mutateValue(
        data,
        propertyKey,
        getRemappedReference(copiedPropertyValue, idMap)
      );
    } else if (isReference(copiedPropertyValue)) {
      mutateValue(
        data,
        propertyKey,
        getRemappedReference(copiedPropertyValue, idMap)
      );
    } else if (isOrderedCollection(copiedPropertyValue)) {
      const newCopiedPropertyValue = { ...copiedPropertyValue };
      const oldIds = [...newCopiedPropertyValue.order];
      newCopiedPropertyValue.order = [];
      oldIds.forEach((id) => {
        newCopiedPropertyValue.order.push(idMap[id] || id);
      });
      mutateValue(data, propertyKey, newCopiedPropertyValue);
    } else if (
      typeof copiedPropertyValue === "object" &&
      copiedPropertyValue !== null
    ) {
      remapDataInternal(copiedPropertyValue, idMap, mutateValue);
    }
  });
};

const remapData = (
  copiedDatas: InstanceData[],
  idMap: { [refId: string]: string },
  mutateValue: Mutater
): void => {
  copiedDatas.forEach((d) => {
    remapDataInternal(d, idMap, mutateValue);
  });
};

const cloneDataInternal = <T extends object>( // eslint-disable-line @typescript-eslint/ban-types
  data: T,
  destinationParent: ParentLookup,
  allData: { [refId: string]: InstanceData },
  newDatas: InstanceData[],
  idMap: { [refId: string]: string },
  generateNewIds: boolean,
  mutateValue: Mutater,
  cloneValue: Cloner
): T => {
  if (!data) {
    return data;
  }

  let copiedData: T = { ...data };

  if (isInstanceData(data)) {
    let clonedInstanceData = cloneValue(data);
    const id =
      generateNewIds && clonedInstanceData.reference.refId !== "config"
        ? getUuid()
        : clonedInstanceData.reference.refId;
    clonedInstanceData = {
      ...clonedInstanceData,
      reference: {
        ...clonedInstanceData.reference,
        ...destinationParent,
        refId: id,
      },
    };
    if (generateNewIds) {
      idMap[data.reference.refId] = id;
    }
    newDatas.push(clonedInstanceData);
    copiedData = clonedInstanceData;
  }

  if (isContainerData(data)) {
    data.childContainerIds?.forEach((id) => {
      const childData = allData[id];
      if (isContainerData(childData)) {
        cloneDataInternal(
          childData,
          getRemappedReference(childData.reference, idMap),
          allData,
          newDatas,
          idMap,
          generateNewIds,
          mutateValue,
          cloneValue
        );
      }
    });
  }

  Object.keys(copiedData).forEach((propertyKey) => {
    const copiedPropertyValue = getValue(copiedData, propertyKey);
    if (isContainerData(copiedPropertyValue)) {
      const newCopiedPropertyValue = cloneDataInternal(
        copiedPropertyValue,
        getRemappedReference(copiedPropertyValue.reference, idMap),
        allData,
        newDatas,
        idMap,
        generateNewIds,
        mutateValue,
        cloneValue
      );
      mutateValue(copiedData, propertyKey, newCopiedPropertyValue);
    } else if (isItemData(copiedPropertyValue)) {
      const newCopiedPropertyValue = cloneDataInternal(
        copiedPropertyValue,
        getRemappedReference(copiedPropertyValue.reference, idMap),
        allData,
        newDatas,
        idMap,
        generateNewIds,
        mutateValue,
        cloneValue
      );
      mutateValue(copiedData, propertyKey, newCopiedPropertyValue);
    } else if (isOrderedCollection(copiedPropertyValue)) {
      const newCopiedPropertyValue = { ...copiedPropertyValue };
      newCopiedPropertyValue.data = {};
      Object.keys(copiedPropertyValue.data).forEach((listKey) => {
        const listValue = copiedPropertyValue.data[listKey];
        if (isContainerData(listValue)) {
          const newCopiedListValue = cloneDataInternal(
            listValue,
            getRemappedReference(listValue.reference, idMap),
            allData,
            newDatas,
            idMap,
            generateNewIds,
            mutateValue,
            cloneValue
          );
          if (isContainerData(newCopiedListValue)) {
            newCopiedPropertyValue.data[newCopiedListValue.reference.refId] =
              newCopiedListValue;
          }
        } else if (isItemData(listValue)) {
          const newCopiedListValue = cloneDataInternal(
            listValue,
            getRemappedReference(listValue.reference, idMap),
            allData,
            newDatas,
            idMap,
            generateNewIds,
            mutateValue,
            cloneValue
          );
          if (isItemData(newCopiedListValue)) {
            newCopiedPropertyValue.data[newCopiedListValue.reference.refId] =
              newCopiedListValue;
          }
        } else {
          newCopiedPropertyValue.data[listKey] = listValue;
        }
      });
      mutateValue(copiedData, propertyKey, newCopiedPropertyValue);
    } else if (
      typeof copiedPropertyValue === "object" &&
      copiedPropertyValue !== null
    ) {
      cloneDataInternal(
        copiedPropertyValue,
        destinationParent,
        allData,
        newDatas,
        idMap,
        generateNewIds,
        mutateValue,
        cloneValue
      );
    }
  });

  return copiedData;
};

const cloneData = (
  sourceIds: string[],
  destinationParent: ParentLookup,
  allDatas: { [refId: string]: InstanceData },
  newDatas: InstanceData[],
  idMap: { [refId: string]: string },
  generateNewIds: boolean,
  mutateValue: Mutater,
  cloneValue: Cloner
): void => {
  sourceIds.forEach((id) => {
    cloneDataInternal(
      allDatas[id],
      destinationParent,
      allDatas,
      newDatas,
      idMap,
      generateNewIds,
      mutateValue,
      cloneValue
    );
  });
};

export const deepCopyData = async (
  sourceIds: string[],
  destinationParent: ParentLookup,
  allDatas: { [refId: string]: InstanceData },
  generateNewIds: boolean
): Promise<InstanceData[]> => {
  const newDatas: InstanceData[] = [];
  const idMap: { [refId: string]: string } = {};
  const mutateValue = (await import("../../../impower-core/utils/mutateValue"))
    .default;
  const cloneValue = (await import("../../../impower-core/utils/cloneValue"))
    .default;
  cloneData(
    sourceIds,
    destinationParent,
    allDatas,
    newDatas,
    idMap,
    generateNewIds,
    mutateValue,
    cloneValue
  );
  if (generateNewIds) {
    remapData(newDatas, idMap, mutateValue);
  }
  return newDatas;
};
