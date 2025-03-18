// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const flattenObjectValues = (obj: { [x: string]: any }): string[] =>
  Object.values(obj).flatMap((value) =>
    value !== null && typeof value === 'object' ? flattenObjectValues(value) : value,
  );
