import KSUID from "ksuid";

export const generateId = (prefix: string) => {
  if (!prefix) {
    return KSUID.randomSync().string;
  } else {
    return `${prefix}_${KSUID.randomSync().string}`;
  }
};

export const compareObjects = (obj1: any, obj2: any) => {
  for (const key in obj1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  return true;
};

export const keyToTitle = (key: string) => {
  return key.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};
