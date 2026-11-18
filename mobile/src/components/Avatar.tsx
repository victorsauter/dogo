import { Image, View } from 'react-native';

import { photoUri } from '@/api/photo';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface AvatarProps {
  /** Person or dog name: used for the initials and the accessibility label. */
  name: string;
  /** `photoUrl` as returned by the API (relative path) or an absolute URI. */
  photoUrl?: string | null;
  size?: number;
  /** Shown instead of initials while `name` is empty (e.g. a dog not named yet). */
  placeholderIcon?: IconName;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((part) => part?.charAt(0) ?? '')
    .join('')
    .toLocaleUpperCase('fr-FR');
}

export function Avatar({ name, photoUrl, size = 48, placeholderIcon = 'person' }: AvatarProps) {
  const { colors } = useTheme();
  const uri = photoUri(photoUrl);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const letters = initials(name);
  const label = letters ? format(t.a11y.avatarOf, { name: name.trim() }) : t.a11y.photo;
  // A line height proportional to the font size: the `body` variant's fixed
  // line height (22) is smaller than the scaled font and clips the letters.
  const fontSize = Math.round(size * 0.4);

  if (uri) {
    return (
      <Image source={{ uri }} style={shape} accessibilityRole="image" accessibilityLabel={label} />
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        shape,
        { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      {letters ? (
        <Text
          style={{
            color: colors.primary,
            fontSize,
            lineHeight: Math.round(fontSize * 1.25),
            fontWeight: '700',
            includeFontPadding: false,
            textAlignVertical: 'center',
          }}
        >
          {letters}
        </Text>
      ) : (
        <Icon name={placeholderIcon} size={Math.round(size * 0.45)} color="primary" />
      )}
    </View>
  );
}
