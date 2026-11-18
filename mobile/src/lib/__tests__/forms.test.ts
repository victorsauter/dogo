import { ApiError } from '@/api/errors';
import { t } from '@/strings';

import {
  dogFormFrom,
  dogFields,
  emptyDogForm,
  limits,
  profileFields,
  serverFieldErrors,
  toCreateDogRequest,
  toUpdateDogRequest,
  validateDog,
  validateProfile,
  type DogFormValues,
} from '../forms';
import { testDog } from '@/test/fixtures';

const valid: DogFormValues = {
  ...emptyDogForm,
  name: ' Biscotte ',
  size: 'Medium',
  sociability: 'Easygoing',
  reactivity: 'None',
  leashHabit: 'OnLeash',
};
const now = new Date(2026, 10, 18);

describe('validateProfile', () => {
  it('requires a display name and limits lengths like the API', () => {
    expect(validateProfile({ displayName: '  ', bio: '' }).displayName).toBe(t.common.required);
    expect(
      validateProfile({ displayName: 'a'.repeat(limits.displayName + 1), bio: '' }),
    ).toHaveProperty('displayName');
    expect(validateProfile({ displayName: 'Léa', bio: 'b'.repeat(limits.bio + 1) })).toHaveProperty(
      'bio',
    );
    expect(validateProfile({ displayName: 'Léa', bio: 'b'.repeat(limits.bio) })).toEqual({});
  });
});

describe('validateDog', () => {
  it('accepts the minimal valid dog', () => {
    expect(validateDog(valid, now)).toEqual({});
  });

  it('requires the name and the four enumerations', () => {
    expect(Object.keys(validateDog(emptyDogForm, now)).sort()).toEqual(
      ['leashHabit', 'name', 'reactivity', 'size', 'sociability'].sort(),
    );
  });

  it('enforces the API limits', () => {
    const errors = validateDog(
      {
        ...valid,
        name: 'n'.repeat(limits.dogName + 1),
        breed: 'b'.repeat(limits.dogBreed + 1),
        description: 'd'.repeat(limits.dogDescription + 1),
      },
      now,
    );
    expect(Object.keys(errors).sort()).toEqual(['breed', 'description', 'name']);
  });

  it('refuses a future birth date but accepts today', () => {
    expect(validateDog({ ...valid, birthDate: new Date(2026, 10, 19) }, now).birthDate).toBe(
      t.dog.birthDateFuture,
    );
    expect(validateDog({ ...valid, birthDate: new Date(2026, 10, 18, 9) }, now)).toEqual({});
  });
});

describe('requests', () => {
  it('create leaves empty optional fields out and trims', () => {
    expect(toCreateDogRequest(valid)).toEqual({
      name: 'Biscotte',
      size: 'Medium',
      sociability: 'Easygoing',
      reactivity: 'None',
      leashHabit: 'OnLeash',
    });
  });

  it('update clears optional fields explicitly (null date and breed, empty description)', () => {
    expect(toUpdateDogRequest(valid)).toMatchObject({
      birthDate: null,
      breed: null,
      description: '',
    });
    expect(
      toUpdateDogRequest({ ...valid, birthDate: new Date(2022, 2, 5), breed: ' Lab ' }),
    ).toMatchObject({
      birthDate: '2022-03-05',
      breed: 'Lab',
    });
  });

  it('the edit form starts from the dog', () => {
    expect(dogFormFrom(testDog)).toMatchObject({
      name: 'Biscotte',
      birthDate: new Date(2022, 2, 15),
      breed: 'Border collie',
    });
  });
});

describe('serverFieldErrors', () => {
  const error = new ApiError({
    kind: 'http',
    status: 400,
    problem: {
      code: 'validation.failed',
      errors: { Name: ['too long'], unknown: ['x'], bio: ['y'] },
    },
  });

  it('maps API fields (any casing) to form fields with a French message', () => {
    expect(serverFieldErrors(error, dogFields)).toEqual({ name: t.common.fieldInvalid });
    expect(serverFieldErrors(error, profileFields)).toEqual({ bio: t.common.fieldInvalid });
  });

  it('ignores other errors', () => {
    expect(serverFieldErrors(new Error('x'), dogFields)).toEqual({});
  });
});
