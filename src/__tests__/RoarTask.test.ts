import { collection, CollectionReference, doc, DocumentReference } from 'firebase/firestore';
import { RoarTaskVariant } from '../firestore/task';
import { rootDoc } from './__utils__/firebaseConfig';

const taskInput = {
  taskId: 'test-task-id',
  taskName: 'test-task-name',
  variantName: 'test-variant-name',
  taskDescription: 'test-task-description',
  variantDescription: 'test-variant-description',
  blocks: [
    {
      blockNumber: 0,
      trialMethod: 'random',
      corpus: 'test-corpus',
    },
  ],
};

describe('RoarTaskVariant', () => {
  it('constructs a task', () => {
    const task = new RoarTaskVariant(taskInput);
    expect(task.taskId).toBe(taskInput.taskId);
    expect(task.taskName).toBe(taskInput.taskName);
    expect(task.variantName).toBe(taskInput.variantName);
    expect(task.taskDescription).toBe(taskInput.taskDescription);
    expect(task.variantDescription).toBe(taskInput.variantDescription);
    expect(task.blocks).toBe(taskInput.blocks);
    expect(task.taskRef).toBe(undefined);
    expect(task.variantId).toBe(undefined);
    expect(task.variantRef).toBe(undefined);
    expect(task.variantsCollectionRef).toBe(undefined);
  });

  it('adds a block', () => {
    const task = new RoarTaskVariant(taskInput);
    const newBlock = {
      blockNumber: 1,
      trialMethod: 'adaptive',
      corpus: 'new-corpus',
    };

    task.addBlock(newBlock);
    expect(task.blocks).toContainEqual(newBlock);
  });

  it('sets Firestore document references', () => {
    const task = new RoarTaskVariant(taskInput);
    task.setRefs(rootDoc);
    expect(task.taskRef).toBeInstanceOf(DocumentReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(task.taskRef!.id).toBe(doc(rootDoc, 'tasks', task.taskId).id);
    expect(task.variantsCollectionRef).toBeInstanceOf(CollectionReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(task.variantsCollectionRef!.id).toBe(collection(rootDoc, 'tasks', task.taskId, 'variants').id);
  });
});
