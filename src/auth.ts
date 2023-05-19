import { Auth, fetchSignInMethodsForEmail } from 'firebase/auth';

/**
 * Return a unique and reproducible email address for the user.
 *
 * @function
 * @param {string} roarPid - The ROAR user PID
 * @returns {string} - The email address
 */
export const roarEmail = (roarPid: string): string => {
  return `${roarPid}@roar-auth.com`;
};

export const isEmailAvailable = async (auth: Auth, email: string): Promise<boolean> => {
  return fetchSignInMethodsForEmail(auth, email).then((signInMethods) => {
    return signInMethods.length === 0;
  });
};

export const isUsernameAvailable = async (auth: Auth, username: string): Promise<boolean> => {
  return isEmailAvailable(auth, roarEmail(username));
};
