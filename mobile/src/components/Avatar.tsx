import { Image, View } from 'react-native';

import { photoUri } from '@/api/photo';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Text } from './Text';

export interface AvatarProps {
  /** Person or dog name: used for the initials and the accessibility label. */
  name: string;
  /** `photoUrl` as returned by the API (relative path) or an absolute URI. */
  photoUrl?: string | null;
  size?: number;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((part) => part?.charAt(0) ?? '')
    .join('')
    .toLocaleUpperCase('fr-FR');
}

export function Avatar({ name, photoUrl, size = 48 }: AvatarProps) {
  const { colors } = useTheme();
  const uri = photoUri(photoUrl);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const label = format(t.a11y.avatarOf, { name });

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
      <Text style={{ color: colors.primary, fontSize: size * 0.4, fontWeight: '700' }}>
        {initials(name)}
      </Text>
    </View>
  );
}
