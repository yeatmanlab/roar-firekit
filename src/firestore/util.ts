/** Remove null attributes from an object
 * @function
 * @param {Object} obj - Object to remove null attributes from
 * @returns {Object} Object with null attributes removed
 */
export const removeNull = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
};
