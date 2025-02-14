import roles from './roles';
import _get from 'lodash/get';
import { jwtDecode } from 'jwt-decode';

interface Role {
  title: string;
  permissions: string[];
}

const fallbackRole = 'GUEST';

/**
 * This function takes a the JWT token of the user and a permission, and validates if the user is allowed to perform the action associated with the permission.
 * @param {string} token A JWT token string from Firestore User.
 * @param {string} permission The permission to check.
 * @returns {Boolean} True if the user has the permission, false otherwise.
 */
export function canUser(token: string, permission: string): boolean {
  const userRole: string = getRoleFromToken(token);
  const role: Role = _get(roles, userRole.toUpperCase());

  // Check to see if the user's role has the requested permission
  const roleTitle: string = userRole.toUpperCase();
  if (roleTitle === 'SUPER_ADMIN') return true;
  const roleHasPermission = checkPermissionList(role.permissions, permission);
  if (roleHasPermission) return true;

  // Else, return false
  return false;
}

/**
 * This function takes a JWT token and returns the user's role. If the token is invalid or missing the role claim,
 * return the GUEST role.
 *
 * @param {string} token JWT token string from Firestore User.
 * @returns {string} The user's role based on the provided JWT token.
 */
function getRoleFromToken(token: string): string {
  const decodedToken = jwtDecode(token);

  // Retrieve the user's role from the token's claims. If the claim is missing or invalid, default to the GUEST role.
  const userRole: string = _get(decodedToken, 'role', fallbackRole);
  if (!_get(decodedToken, 'role')) {
    console.warn(
      `[ROAR Permissions Manager] Invalid or missing role claim in User's custom claims. Defaulting to the ${fallbackRole} role.`,
    );
  }
  return userRole;
}

/**
 * This function checks if a permission is included in a list of permissions.
 *
 * @param {string[]} permissionsList List of permissions to check against.
 * @param {string} permission Permission to check.
 * @returns {Boolean} True if the permission is in the list, false otherwise.
 */
function checkPermissionList(permissionsList: string[], permission: string): boolean {
  // Check if the literal permission is in the list
  const literalPermissionMatch = permissionsList.includes(permission);
  console.log('[RPM] Checking literal permission match', literalPermissionMatch);
  if (literalPermissionMatch) return true;

  // Check if the permission matches a wildcard permission
  for (const rolePermission of permissionsList) {
    const wildcardMatch = matchWildcardPermission(permission, rolePermission);
    const reverseWidcardMatch = matchWildcardPermission(rolePermission, permission);
    console.log('[RPM] Checking wildcard permission match', wildcardMatch);
    if (wildcardMatch || reverseWidcardMatch) return true;
  }

  // Else, return false
  return false;
}

/**
 * This function checks if a permission matches a wildcard permission within a permission list.
 * ex. 'app.users.create' matches 'app.user.*' and 'app.*'
 *
 * @param {string} permission Permisssion from the
 * @param {string} userPermission Permission to check. This will be from the user.
 * @returns {Boolean} True if the permissions match considering wildcards. False otherwise.
 */
function matchWildcardPermission(pattern: string, permission: string): boolean {
  console.log('[RPM] Checking wildcard permission', pattern, permission);
  const patternParts = pattern.split('.');
  const permissionParts = permission.split('.');
  console.log('[RPM] Permission parts', permissionParts);
  console.log('[RPM] Pattern parts', patternParts);

  // Check if the first parts match
  if (patternParts[0] !== permissionParts[0]) {
    return false;
  }

  // Check if the pattern has a wildcard
  const wildcardIndex = patternParts.indexOf('*');
  console.log('[RPM] Wildcard index', wildcardIndex);

  // If there's no wildcard, the parts should match exactly
  if (wildcardIndex === -1) {
    console.log('[RPM] No wildcard');
    return (
      patternParts.length === permissionParts.length &&
      patternParts.every((part, index) => part === permissionParts[index])
    );
  }

  // If there's a wildcard, it must be the last part
  if (wildcardIndex !== patternParts.length - 1) {
    return false;
  }

  // Check if all parts before the wildcard match
  for (let i = 1; i < wildcardIndex; i++) {
    if (patternParts[i] !== permissionParts[i]) {
      return false;
    }
  }

  // The wildcard matches any number of remaining parts in the permission
  return true;
}
