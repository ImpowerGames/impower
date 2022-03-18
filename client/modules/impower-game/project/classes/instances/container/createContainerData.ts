import { ContainerType } from "../../../../data/enums/data";
import { ContainerReference } from "../../../../data/interfaces/references/containerReference";
import { createInstanceData } from "../../instance/createInstanceData";
import { ContainerData } from "./containerData";

export const createContainerData = <
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
>(
  obj?: Partial<ContainerData<D, R>> & Pick<ContainerData<D, R>, "reference">
): ContainerData<D, R> => ({
  ...createInstanceData(obj),
  name: "NewContainer",
  children: [],
  ...obj,
});
