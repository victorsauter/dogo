import type { Dog, DogMember, UserSummary } from '@/api/types';
import { format, t } from '@/strings';

/** `true` when `userId` is one of the dog's humans with the `Owner` role (spec §3). */
export function isDogOwner(dog: Pick<Dog, 'members'>, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return dog.members.some((member) => member.role === 'Owner' && member.user.id === userId);
}

/**
 * Names as a French list, at most `max` entries: « A », « A et B », « A, B et C »,
 * and past `max`, « A, B et 2 autres » (`max - 1` names, then the number left).
 */
export function listNames(names: string[], max: number): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) {
    return format(t.dog.listAnd, {
      names: names.slice(0, -1).join(', '),
      last: names[names.length - 1]!,
    });
  }
  return format(t.dog.listOthers, {
    names: names.slice(0, max - 1).join(', '),
    count: names.length - (max - 1),
  });
}

/** The humans of a dog, `me` (if among them) moved to the end and called « toi ». */
export function humanNames(members: DogMember[], meId: string | null | undefined): string[] {
  const others = members.filter((member) => member.user.id !== meId);
  const names = others.map((member) => member.user.displayName);
  return others.length < members.length ? [...names, t.dog.youInline] : names;
}

/** « avec Camille et Victor », « avec Camille et toi », « avec toi », « avec A, B et 2 autres ». */
export function withHumansPhrase(members: DogMember[], meId: string | null | undefined): string {
  return format(t.dog.withHumans, { names: listNames(humanNames(members, meId), 3) });
}

/** The dog's humans other than the one whose profile is shown, in API order. */
export function otherHumans(members: DogMember[], profileUserId: string): UserSummary[] {
  return members.filter((member) => member.user.id !== profileUserId).map((member) => member.user);
}

/**
 * « aussi avec Camille » on a dog's card in the profile of `profileUserId`: the
 * dog's other humans. `null` when there are none.
 */
export function alsoWithPhrase(members: DogMember[], profileUserId: string): string | null {
  const others = otherHumans(members, profileUserId);
  if (others.length === 0) return null;
  return format(t.dog.alsoWithHumans, {
    names: listNames(
      others.map((user) => user.displayName),
      2,
    ),
  });
}
