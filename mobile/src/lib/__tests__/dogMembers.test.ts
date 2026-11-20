import type { DogMember } from '@/api/types';

import { alsoWithPhrase, humanNames, isDogOwner, listNames, withHumansPhrase } from '../dogMembers';

const human = (id: string, displayName = id): DogMember => ({
  user: { id, displayName, photoUrl: null },
  role: 'Owner',
});
const camille = human('c', 'Camille');
const victor = human('v', 'Victor');
const lea = human('l', 'Léa');
const marc = human('m', 'Marc');
const me = human('me', 'Moi-même');

describe('isDogOwner', () => {
  it('is true when the user is a member with the Owner role', () => {
    expect(isDogOwner({ members: [camille, me] }, 'me')).toBe(true);
  });
  it('is false for someone who is not a member, or without a user', () => {
    expect(isDogOwner({ members: [camille] }, 'me')).toBe(false);
    expect(isDogOwner({ members: [camille] }, undefined)).toBe(false);
    expect(isDogOwner({ members: [] }, 'me')).toBe(false);
  });
});

describe('listNames', () => {
  it('writes one, two and three names', () => {
    expect(listNames(['A'], 3)).toBe('A');
    expect(listNames(['A', 'B'], 3)).toBe('A et B');
    expect(listNames(['A', 'B', 'C'], 3)).toBe('A, B et C');
  });
  it('counts the rest past the limit', () => {
    expect(listNames(['A', 'B', 'C', 'D'], 3)).toBe('A, B et 2 autres');
    expect(listNames(['A', 'B', 'C'], 2)).toBe('A et 2 autres');
  });
});

describe('withHumansPhrase', () => {
  it('names one, two, three and four humans without me', () => {
    expect(withHumansPhrase([camille], 'me')).toBe('avec Camille');
    expect(withHumansPhrase([camille, victor], 'me')).toBe('avec Camille et Victor');
    expect(withHumansPhrase([camille, victor, lea], 'me')).toBe('avec Camille, Victor et Léa');
    expect(withHumansPhrase([camille, victor, lea, marc], 'me')).toBe(
      'avec Camille, Victor et 2 autres',
    );
  });
  it('puts me last as « toi », wherever I come in the list', () => {
    expect(withHumansPhrase([me], 'me')).toBe('avec toi');
    expect(withHumansPhrase([me, camille], 'me')).toBe('avec Camille et toi');
    expect(withHumansPhrase([camille, me, victor], 'me')).toBe('avec Camille, Victor et toi');
    expect(humanNames([me, camille], 'me')).toEqual(['Camille', 'toi']);
  });
  it('past three, counts the others, me included in the last one', () => {
    expect(withHumansPhrase([me, camille, victor, lea], 'me')).toBe(
      'avec Camille, Victor et 2 autres',
    );
  });
});

describe('alsoWithPhrase', () => {
  it('is null when the profile’s owner is the only human', () => {
    expect(alsoWithPhrase([camille], 'c')).toBeNull();
  });
  it('names the other humans, two at most', () => {
    expect(alsoWithPhrase([camille, victor], 'c')).toBe('aussi avec Victor');
    expect(alsoWithPhrase([camille, victor, lea], 'c')).toBe('aussi avec Victor et Léa');
    expect(alsoWithPhrase([camille, victor, lea, marc], 'c')).toBe('aussi avec Victor et 2 autres');
  });
});
