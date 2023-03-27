import { enableIndexedDbPersistence } from 'firebase/firestore';

/** Remove null attributes from an object
 * @function
 * @param {Object} obj - Object to remove null attributes from
 * @returns {Object} Object with null attributes removed
 */
export const removeNull = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
};

export const roarEnableIndexedDbPersistence = (db) => {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log(
        "Couldn't enable indexed db persistence. This is probably because the browser has multiple roar tabs open.",
      );
      // Multiple tabs open, persistence can only be enabled
      // in one tab at a a time.
      // ...
    } else if (err.code == 'unimplemented') {
      console.log("Couldn't enable indexed db persistence. This is probably because the browser doesn't support it.");
      // The current browser does not support all of the
      // features required to enable persistence
      // ...
    }
  });
  // Subsequent queries will use persistence, if it was enabled successfully
};
