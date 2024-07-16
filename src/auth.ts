import { Auth, fetchSignInMethodsForEmail, EmailAuthProvider } from 'firebase/auth';

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

export const isRoarAuthEmail = (email: string) => {
  return email.split('@')[1] === 'roar-auth.com';
};

export const isEmailAvailable = async (auth: Auth, email: string) => {
  return fetchSignInMethodsForEmail(auth, email).then((signInMethods) => {
    return signInMethods.length === 0;
  });
};

export const isUsernameAvailable = async (auth: Auth, username: string) => {
  return isEmailAvailable(auth, roarEmail(username));
};

export const fetchEmailAuthMethods = async (auth: Auth, email: string) => {
  return fetchSignInMethodsForEmail(auth, email).then((signInMethods) => {
    const methods = [];

    if (signInMethods.indexOf(EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD) != -1) {
      // User can sign in with email/password.
      methods.push('password');
    }
    if (signInMethods.indexOf(EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD) != -1) {
      // User can sign in with email/link.
      methods.push('link');
    }
    if (signInMethods.indexOf('google.com') != -1) {
      methods.push('google');
    }
    if (signInMethods.indexOf('oidc.clever') != -1) {
      methods.push('clever');
    }
    if (signInMethods.indexOf('oidc.classlink') != -1) {
      methods.push('classlink');
    }
    return methods;
  });
};
