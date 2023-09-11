const getKeys = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[];

export default getKeys;
