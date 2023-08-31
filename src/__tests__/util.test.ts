import {
  crc32String,
  getTreeTableOrgs,
  mergeGameParams,
  removeNull,
  removeUndefined,
  replaceValues,
} from '../firestore/util';

describe('removeNull', () => {
  it('removes null values', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: null,
      d: '',
      e: null,
      f: {
        g: 1,
        h: 'foo',
        i: null,
        j: '',
        k: null,
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
        k: null,
      },
    };

    expect(removeNull(input)).toStrictEqual(expected);
  });
});

describe('removeUndefined', () => {
  it('removes null values', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: undefined,
      d: '',
      e: undefined,
      f: {
        g: 1,
        h: 'foo',
        i: undefined,
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
        i: undefined,
        j: '',
        k: undefined,
      },
    };

    expect(removeUndefined(input)).toStrictEqual(expected);
  });
});

describe('mergeGameParams', () => {
  it('detects changed keys', () => {
    const obj1 = {
      a: 1,
      b: null,
      c: null,
      d: { baz: 1, bat: 2 },
    };

    const obj2 = {
      a: 1,
      b: 2,
      c: { foo: 1, bar: 'monkey' },
      d: { baz: 1, bat: 2 },
    };

    const result = mergeGameParams(obj1, obj2);
    const expected = { keysAdded: false, merged: { ...obj2 } };

    expect(result).toStrictEqual(expected);

    const resultAdded = mergeGameParams(obj1, { ...obj2, newParam: true });
    expect(resultAdded).toStrictEqual({ keysAdded: true, merged: { ...obj2, newParam: true } });

    expect(() => {
      mergeGameParams({ ...obj1, oldParam: true }, obj2);
    }).toThrow('Detected deleted keys: oldParam');

    expect(() => {
      mergeGameParams(obj1, { ...obj2, d: 'updatedValue' });
    }).toThrow('Attempted to change previously non-null value with key d');
  });
});

describe('replaceValues', () => {
  it('replaces values with default args', () => {
    const input = {
      a: undefined,
      b: 1,
      c: { foo: 1, bar: undefined },
      d: { baz: 1, bat: { e: 42, f: undefined } },
    };

    const expected1 = {
      a: null,
      b: 1,
      c: { foo: 1, bar: null },
      d: { baz: 1, bat: { e: 42, f: null } },
    };

    const expected2 = {
      a: undefined,
      b: '1',
      c: { foo: '1', bar: undefined },
      d: { baz: '1', bat: { e: 42, f: undefined } },
    };

    const result1 = replaceValues(input);
    const result2 = replaceValues(input, 1, '1');

    expect(result1).toStrictEqual(expected1);
    expect(result2).toStrictEqual(expected2);
  });
});

describe('crc32String', () => {
  it('computes a checksum of emails', () => {
    const input = 'roar@stanford.edu';
    const expected = '5a036850';

    expect(crc32String(input)).toBe(expected);
  });
});

describe('getTreeTableOrgs', () => {
  it('correctly nests orgs starting with districts', () => {
    const expected = [
      {
        key: '0',
        data: {
          id: 'ab',
          foo: 'bar',
          orgType: 'district',
        },
        children: [
          {
            key: '0-0',
            data: {
              districtId: 'ab',
              id: 'cd',
              baz: 'bat',
              orgType: 'school',
            },
            children: [
              { key: '0-0-0', data: { schoolId: 'cd', id: 'de', data: 42, orgType: 'class' } },
              { key: '0-0-1', data: { schoolId: 'cd', id: 'fg', data: 33, orgType: 'class' } },
            ],
          },
          {
            key: '0-1',
            data: {
              id: 'hi',
              districtId: 'ab',
              orgType: 'school',
            },
            children: [{ key: '0-1-0', data: { schoolId: 'hi', id: 'jk', data: 22, orgType: 'class' } }],
          },
        ],
      },
      {
        key: '1',
        data: {
          id: 'lm',
          foo: 'buzz',
          orgType: 'district',
        },
        children: [
          {
            key: '1-0',
            data: {
              districtId: 'lm',
              id: 'no',
              baz: 'flurf',
              orgType: 'school',
            },
            children: [
              { key: '1-0-0', data: { schoolId: 'no', id: 'pq', data: 52, orgType: 'class' } },
              { key: '1-0-1', data: { schoolId: 'no', id: 'rs', data: 43, orgType: 'class' } },
            ],
          },
          {
            key: '1-1',
            data: {
              districtId: 'lm',
              id: 'tu',
              orgType: 'school',
            },
            children: [{ key: '1-1-0', data: { schoolId: 'tu', id: 'vw', data: 32, orgType: 'class' } }],
          },
        ],
      },
      {
        key: '2',
        data: {
          id: 'xy',
          foo: 'xyzzy',
          orgType: 'school',
        },
      },
      {
        key: '3',
        data: {
          id: 'zz',
          orgType: 'class',
        },
      },
    ];
    const input = {
      districts: [
        {
          id: 'ab',
          foo: 'bar',
        },
        {
          id: 'lm',
          foo: 'buzz',
        },
      ],
      schools: [
        {
          districtId: 'ab',
          id: 'cd',
          baz: 'bat',
        },
        {
          districtId: 'ab',
          id: 'hi',
        },
        {
          districtId: 'lm',
          id: 'no',
          baz: 'flurf',
        },
        {
          districtId: 'lm',
          id: 'tu',
        },
        {
          id: 'xy',
          foo: 'xyzzy',
        },
      ],
      classes: [
        { schoolId: 'cd', id: 'de', data: 42 },
        { schoolId: 'cd', id: 'fg', data: 33 },
        { schoolId: 'hi', id: 'jk', data: 22 },
        { schoolId: 'no', id: 'pq', data: 52 },
        { schoolId: 'no', id: 'rs', data: 43 },
        { schoolId: 'tu', id: 'vw', data: 32 },
        { id: 'zz' },
      ],
    };

    const result = getTreeTableOrgs(input);

    expect(result).toStrictEqual(expected);
  });
});

describe('getTreeTableOrgs', () => {
  it('correctly nests orgs starting with schools', () => {
    const expected = [
      {
        key: '0',
        data: {
          districtId: 'ab',
          id: 'cd',
          baz: 'bat',
          orgType: 'school',
        },
        children: [
          { key: '0-0', data: { schoolId: 'cd', id: 'de', data: 42, orgType: 'class' } },
          { key: '0-1', data: { schoolId: 'cd', id: 'fg', data: 33, orgType: 'class' } },
        ],
      },
      {
        key: '1',
        data: {
          id: 'hi',
          districtId: 'ab',
          orgType: 'school',
        },
        children: [{ key: '1-0', data: { schoolId: 'hi', id: 'jk', data: 22, orgType: 'class' } }],
      },
      {
        key: '2',
        data: {
          districtId: 'lm',
          id: 'no',
          baz: 'flurf',
          orgType: 'school',
        },
        children: [
          { key: '2-0', data: { schoolId: 'no', id: 'pq', data: 52, orgType: 'class' } },
          { key: '2-1', data: { schoolId: 'no', id: 'rs', data: 43, orgType: 'class' } },
        ],
      },
      {
        key: '3',
        data: {
          districtId: 'lm',
          id: 'tu',
          orgType: 'school',
        },
        children: [{ key: '3-0', data: { schoolId: 'tu', id: 'vw', data: 32, orgType: 'class' } }],
      },
      {
        key: '4',
        data: {
          id: 'xy',
          foo: 'xyzzy',
          orgType: 'school',
        },
      },
      {
        key: '5',
        data: {
          id: 'zz',
          orgType: 'class',
        },
      },
    ];

    const input = {
      schools: [
        {
          districtId: 'ab',
          id: 'cd',
          baz: 'bat',
        },
        {
          districtId: 'ab',
          id: 'hi',
        },
        {
          districtId: 'lm',
          id: 'no',
          baz: 'flurf',
        },
        {
          districtId: 'lm',
          id: 'tu',
        },
        {
          id: 'xy',
          foo: 'xyzzy',
        },
      ],
      classes: [
        { schoolId: 'cd', id: 'de', data: 42 },
        { schoolId: 'cd', id: 'fg', data: 33 },
        { schoolId: 'hi', id: 'jk', data: 22 },
        { schoolId: 'no', id: 'pq', data: 52 },
        { schoolId: 'no', id: 'rs', data: 43 },
        { schoolId: 'tu', id: 'vw', data: 32 },
        { id: 'zz' },
      ],
    };

    const result = getTreeTableOrgs(input);

    expect(result).toStrictEqual(expected);
  });
});
