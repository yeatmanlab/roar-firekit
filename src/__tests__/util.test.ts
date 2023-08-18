import {
  crc32String,
  getTreeTableOrgs,
  getObjectDiff,
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

describe('getObjectDiff', () => {
  it('detects changed keys', () => {
    const obj1 = {
      a: 1,
      b: 2,
      c: { foo: 1, bar: 2 },
      d: { baz: 1, bat: 2 },
    };

    const obj2 = {
      b: 2,
      c: { foo: 1, bar: 'monkey' },
      d: { baz: 1, bat: 2 },
      e: 1,
    };

    const result = getObjectDiff(obj1, obj2);
    const expected = ['c', 'e', 'a'];

    expect(result.sort()).toEqual(expected.sort());
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
  it('correctly nests orgs', () => {
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
      ],
      classes: [
        { schoolId: 'cd', id: 'de', data: 42 },
        { schoolId: 'cd', id: 'fg', data: 33 },
        { schoolId: 'hi', id: 'jk', data: 22 },
        { schoolId: 'no', id: 'pq', data: 52 },
        { schoolId: 'no', id: 'rs', data: 43 },
        { schoolId: 'tu', id: 'vw', data: 32 },
      ],
    };

    const result = getTreeTableOrgs(input);

    expect(result).toStrictEqual(expected);
  });
});
