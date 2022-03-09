import { getAuth } from 'firebase/auth';
import { DocumentReference } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { RoarUser } from '../firestore/user';
import { RoarRun } from '../firestore/run';
import { firebaseSignIn } from '../auth';
import { firebaseApp, rootDoc } from './__utils__/firebaseConfig';

const auth = getAuth(firebaseApp);

const getRandomUserInput = async (withSignIn = false) => {
  const uid = `ci-user-${uuidv4()}`;
  const userInput = {
    id: uid,
    firebaseUid: '',
    taskId: 'test-task-id',
    variantId: 'test-variant-id',
    birthMonth: 1,
    birthYear: 1983,
    classId: 'test-class-id',
    schoolId: 'test-school-id',
    districtId: 'test-district-id',
    studyId: 'test-study-id',
    userCategory: 'student' as const,
  };

  if (withSignIn) {
    await firebaseSignIn(uid);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    userInput.firebaseUid = auth.currentUser!.uid;
  } else {
    userInput.firebaseUid = 'test-firebase-uid';
  }

  return userInput;
};

describe('RoarRun', () => {
  it('constructs a run', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);
    const taskId = 'test-task-id';
    const variantId = 'test-variant-id';
    const run = new RoarRun({ user, taskId, variantId });
    expect(run.user).toBe(user);
    expect(run.taskId).toBe(taskId);
    expect(run.variantId).toBe(variantId);
    expect(run.runRef).toBeInstanceOf(DocumentReference);
    expect(run.started).toBe(false);
  });

  it('throws an error if user is not a student', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    user.userCategory = 'educator';
    const taskId = 'test-task-id';
    const variantId = 'test-variant-id';
    expect(() => new RoarRun({ user, taskId, variantId })).toThrow('Only students can start a run.');
  });

  it('throws an error if user refs not set', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const taskId = 'test-task-id';
    const variantId = 'test-variant-id';
    expect(() => new RoarRun({ user, taskId, variantId })).toThrow(
      'User refs not set. Please use the user.setRefs method first.',
    );
  });
});
