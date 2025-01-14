import { vi } from 'vitest';
import { AppkitInput, RoarAppkit } from '../../firestore/app/appkit';
import parameterSchema from '../__fixtures__/parameterSchema.json';

const mockValidGameParameters = {
  userMode: 'shortAdaptive',
  recruitment: 'school',
};
const mockInvalidGameParameters = {
  userMode: 'nonExistent',
  recruitment: 'invalid',
};
const mockValidAppkitInput = { taskInfo: { variantParams: mockValidGameParameters } } as unknown as AppkitInput;
const mockInvalidAppkitInput = { taskInfo: { variantParams: mockInvalidGameParameters } } as unknown as AppkitInput;
const errorMessage = 'Error in parameter "/recruitment": must be equal to one of the allowed values';

vi.mock('../../firestore/app/appkit', async () => {
  // Import the actual RoarAppkit class
  const actualRoarAppkit = (await vi
    .importActual('../../firestore/app/appkit')
    .then((module) => module.RoarAppkit)) as any;

  // Mock the RoarAppkit class using recommended approach via Vitest documentation
  const mockRoarAppkit = function (input: AppkitInput) {
    // Set specific properties of the actual RoarAppkit class
    this._taskInfo = input.taskInfo;
  };

  // Set the validateParameters method of the mockRoarAppkit class to the actual RoarAppkit class method
  mockRoarAppkit.prototype.validateParameters = actualRoarAppkit.prototype.validateParameters;

  return { RoarAppkit: mockRoarAppkit };
});

describe('validateParameters', () => {
  it('validates the parameters', async () => {
    const appkit = new RoarAppkit(mockValidAppkitInput);
    await expect(appkit.validateParameters(parameterSchema as any)).resolves.not.toThrowError();
  });
  it('throws an error if the parameters are invalid', async () => {
    const appkit = new RoarAppkit(mockInvalidAppkitInput);
    await expect(appkit.validateParameters(parameterSchema as any)).rejects.toThrowError();
  });
  it('displays the appropriate error message if the parameters are invalid', async () => {
    try {
      const appkit = new RoarAppkit(mockInvalidAppkitInput);
      await appkit.validateParameters(parameterSchema as any);
    } catch (error) {
      expect(error.message).toContain(errorMessage);
    }
  });
});
