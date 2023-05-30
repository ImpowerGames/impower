import short from "short-uuid";

const getUuid = (): string => short.generate();

export default getUuid;
