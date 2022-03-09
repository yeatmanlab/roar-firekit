import { removeNull } from '../firestore/util';

describe('removeNull', () => {
  it('removes null values', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: null,
      d: '',
      e: undefined,
      f: {
        g: 1,
        h: 'foo',
        i: null,
        j: '',
        k: undefined,
      },
    };

    const expected = {
      a: 1,
      b: 'foo',
      d: '',
      f: {
        g: 1,
        h: 'foo',
        i: null,
        j: '',
        k: undefined,
      },
    };

    expect(removeNull(input)).toStrictEqual(expected);
  });
});
