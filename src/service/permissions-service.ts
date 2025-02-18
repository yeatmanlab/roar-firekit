import { roles } from '../constants/roles';
import { UserRoles, FallbackRole } from '../constants/user-roles';
import _get from 'lodash/get';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  role: string;
}

export const PermissionsService = (() => {
  /**
   * This function takes a the JWT token of the user and a permission, and validates if the user is allowed to perform the action associated with the permission.
   * @param {string} token A JWT token string from Firestore User.
   * @param {string} permission The permission to check.
   * @returns {Boolean} True if the user has the permission, false otherwise.
   */
  const canUser = (token: string, permission: string) => {
    console.log(`[ROAR Permissions Manager] Checking permission ${permission} with token: ${token}`);
    try {
      const userRole = getRoleFromToken(token)?.toUpperCase();

      // If the user is a super admin, grant permission.
      if (userRole === UserRoles.SUPER_ADMIN) return true;

      const config = roles[userRole as keyof typeof roles];

      // If the user role doesn't exist in our config, flag and deny.
      if (!config) {
        console.error(`[ROAR Permissions Service] Invalid user role "${userRole}".`);
        return false;
      }

      return checkPermissionList(config.permissions, permission);
    } catch (error) {
      console.error('[ROAR Permissions Service] Error checking permissions:', error);
      return false;
    }
  };

  /**
   * This function takes a JWT token and returns the user's role. If the token is invalid or missing the role claim,
   * return the GUEST role.
   *
   * @param {string} token JWT token string from Firestore User.
   * @returns {string} The user's role based on the provided JWT token.
   */
  const getRoleFromToken = (token: string) => {
    const decodedToken = jwtDecode<DecodedToken>(token);
    const userRole = decodedToken.role ?? FallbackRole;

    // Retrieve the user's role from the token's claims. If the claim is missing or invalid, default to the GUEST role.
    if (!decodedToken.role) {
      console.warn(
        `[ROAR Permissions Manager] Invalid or missing role claim in User's custom claims. Defaulting to the ${FallbackRole} role.`,
      );
    }
    return userRole;
  };

  /**
   * This function checks if a permission is included in a list of permissions.
   *
   * @param {string[]} permissionsList List of permissions to check against.
   * @param {string} permission Permission to check.
   * @returns {Boolean} True if the permission is in the list, false otherwise.
   */
  const checkPermissionList = (permissionsList: string[], permission: string) => {
    // Check if the literal permission is in the list
    if (permissionsList.includes(permission)) return true;
    // Check if the permission matches a wildcard permission
    return permissionsList.some((rolePermission) => matchWildcardPermission(rolePermission, permission));
  };

  /**
   * This function checks if a permission matches a wildcard permission within a permission list.
   * ex. 'app.users.create' matches 'app.user.*' and 'app.*'
   *
   * @param {string} permission Permisssion from the
   * @param {string} userPermission Permission to check. This will be from the user.
   * @returns {Boolean} True if the permissions match considering wildcards. False otherwise.
   */
  const matchWildcardPermission = (pattern: string, permission: string) => {
    const patternParts = pattern.split('.');
    const permissionParts = permission.split('.');
    // Check if the pattern has a wildcard
    const wildcardIndex = patternParts.indexOf('*');

    // If there's no wildcard, the parts should match exactly
    if (wildcardIndex === -1) {
      return (
        patternParts.length === permissionParts.length &&
        patternParts.every((part, index) => part === permissionParts[index])
      );
    }
    // If there's a wildcard, it must be the last part
    if (wildcardIndex !== patternParts.length - 1) return false;
    // Check if all parts before the wildcard match
    return patternParts.slice(0, wildcardIndex).every((part, index) => part === permissionParts[index]);
  };

  return { canUser };
})();
