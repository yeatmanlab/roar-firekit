import { convertTrialToFirestore } from '../firestore/app/run';

describe('convertTrialToFirestore', () => {
  it('removes all undefined properties', () => {
    const trialData = {
      a: 1,
      b: undefined,
      c: {
        d: 2,
        e: undefined,
        f: {
          g: 3,
          h: undefined,
        },
      },
    };

    const expected = {
      a: 1,
      c: {
        d: 2,
        f: {
          g: 3,
        },
      },
    };

    expect(convertTrialToFirestore(trialData)).toEqual(expected);
  });
});
