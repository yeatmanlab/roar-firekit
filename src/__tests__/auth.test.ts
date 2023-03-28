import { firebaseSignIn, firebaseSignOut, roarEmail, roarPassword } from '../auth';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { firebaseApp } from './__utils__/firebaseConfig';

describe('roarEmail', () => {
  it('returns a dispostable email address', () => {
    const uid = 'test-uid';
    expect(roarEmail(uid)).toBe(`${uid}@dispostable.com`);
  });
});

describe('roarPassword', () => {
  it('returns a valid UUID', () => {
    const password = roarPassword('test-uid');
    // password is a UUID without hyphens. Let's put them back in before validating.
    const passUuid = password.replace(
      /([0-9A-Fa-f]{8})([0-9A-Fa-f]{4})([0-9A-Fa-f]{4})([0-9A-Fa-f]{4})([0-9A-Fa-f]{12})/,
      '$1-$2-$3-$4-$5',
    );
    expect(validateUuid(passUuid)).toBeTruthy();
  });

  it('returns a consistent password', () => {
    const uid = 'test-uid';
    const password1 = roarPassword(uid);
    const password2 = roarPassword(uid);
    expect(password1).toBe(password2);
  });

  it('returns a unique password', () => {
    const password1 = roarPassword('test-uid1');
    const password2 = roarPassword('test-uid2');
    expect(password1).not.toBe(password2);
  });
});

describe('firebaseSignIn', () => {
  it('does not swallow authentication errors', async () => {
    const uid = '';
    await expect(async () => await firebaseSignIn(uid)).rejects.toThrow('auth/invalid-email');
  });
});

describe('New users', () => {
  test('are created if they do not exist', async () => {
    const uid = `roar-ci-user-${uuidv4()}`;
    const expectedEmail = roarEmail(uid);
    const initialAuth = getAuth(firebaseApp);

    // Use jest to confirm that the user does not exist
    await expect(
      async () => await signInWithEmailAndPassword(initialAuth, expectedEmail, roarPassword(uid)),
    ).rejects.toThrow('auth/user-not-found');

    const auth = await firebaseSignIn(uid);
    expect(auth.currentUser).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(auth.currentUser!.email).toBe(expectedEmail);

    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
  });
});

describe('Existing users', () => {
  const auth = getAuth(firebaseApp);
  const uid = `roar-ci-user-${uuidv4()}`;
  const expectedEmail = roarEmail(uid);

  beforeAll(async () => {
    await createUserWithEmailAndPassword(auth, expectedEmail, roarPassword(uid));
  });

  afterAll(async () => {
    if (!auth.currentUser) {
      await signInWithEmailAndPassword(auth, roarEmail(uid), roarPassword(uid));
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteUser(auth.currentUser!);
  });

  test('can sign in', async () => {
    const authReturned = await firebaseSignIn(uid);

    expect(authReturned.currentUser).toBeTruthy();
    expect(auth.currentUser).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(authReturned.currentUser!.uid).toBe(auth.currentUser!.uid);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(authReturned.currentUser!.email).toBe(expectedEmail);
  });

  test('can sign out', async () => {
    await firebaseSignOut();
    expect(auth.currentUser).toBeFalsy();
  });
});
