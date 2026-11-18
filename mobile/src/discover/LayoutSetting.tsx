import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { useDiscoverLayout, type DiscoverLayout } from './layoutPreference';

const options: { value: DiscoverLayout; label: string; description: string }[] = [
  { value: 'panel', label: t.discoverLayout.panel, description: t.discoverLayout.panelHint },
  { value: 'list', label: t.discoverLayout.list, description: t.discoverLayout.listHint },
];

/**
 * « Affichage des balades » in the profile settings: two cards, each with a
 * small sketch of its view, to pick how the « Balades » tab shows the walks.
 * The change applies at once (see `layoutPreference.ts`) and is kept on the device.
 */
export function LayoutSetting() {
  const { spacing } = useTheme();
  const { layout, setLayout } = useDiscoverLayout();
  // While the stored choice is read, the default is shown: it is what most people have.
  const current = layout ?? 'panel';
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t.discoverLayout.title}
      style={{ gap: spacing.md }}
    >
      {options.map((option) => (
        <LayoutOption
          key={option.value}
          layout={option.value}
          label={option.label}
          description={option.description}
          checked={option.value === current}
          onPress={() => setLayout(option.value)}
        />
      ))}
    </View>
  );
}

function LayoutOption({
  layout,
  label,
  description,
  checked,
  onPress,
}: {
  layout: DiscoverLayout;
  label: string;
  description: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, selected: checked }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: minTouchSize,
        padding: spacing.md,
        borderRadius: radii.lg,
        // Same width either way, so the card does not shift: the checked one is
        // told apart by its border, its tint and its tick, not by colour alone.
        borderWidth: 2,
        borderColor: checked ? colors.primary : colors.border,
        backgroundColor: checked
          ? colors.primarySoft
          : pressed
            ? colors.surfaceMuted
            : colors.surface,
      })}
    >
      <Sketch layout={layout} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{label}</Text>
        <Text variant="caption" color="textMuted">
          {description}
        </Text>
      </View>
      <View
        testID={checked ? 'layout-checked' : undefined}
        style={{
          width: 28,
          height: 28,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : 'transparent',
        }}
      >
        {checked ? <Icon name="check" size={16} color="onPrimary" /> : null}
      </View>
    </Pressable>
  );
}

const SKETCH_WIDTH = 72;
const SKETCH_HEIGHT = 64;

/** A tiny drawing of a view, made of plain `View`s and theme colours. Decorative. */
function Sketch({ layout }: { layout: DiscoverLayout }) {
  const { colors, radii } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: SKETCH_WIDTH,
        height: SKETCH_HEIGHT,
        borderRadius: radii.sm,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: layout === 'panel' ? colors.primarySoft : colors.background,
      }}
    >
      {layout === 'panel' ? <PanelSketch /> : <ListSketch />}
    </View>
  );
}

/** A map with two pins, a sliding panel at the bottom. */
function PanelSketch() {
  const { colors, radii } = useTheme();
  const pin = { position: 'absolute', width: 8, height: 8, borderRadius: radii.pill } as const;
  return (
    <>
      <View style={{ ...pin, top: 10, left: 16, backgroundColor: colors.accent }} />
      <View style={{ ...pin, top: 20, left: 46, backgroundColor: colors.accent }} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 30,
          alignItems: 'center',
          gap: 5,
          paddingTop: 4,
          borderTopLeftRadius: radii.sm,
          borderTopRightRadius: radii.sm,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View
          style={{ width: 20, height: 3, borderRadius: radii.pill, backgroundColor: colors.border }}
        />
        <View
          style={{
            width: 48,
            height: 6,
            borderRadius: radii.pill,
            backgroundColor: colors.textMuted,
          }}
        />
      </View>
    </>
  );
}

/** Walk rows stacked on the full height. */
function ListSketch() {
  const { colors, radii } = useTheme();
  return (
    <View style={{ flex: 1, gap: 4, padding: 5 }}>
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 5,
            borderRadius: radii.sm / 2,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              width: row === 1 ? 34 : 42,
              height: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.textMuted,
            }}
          />
        </View>
      ))}
    </View>
  );
}
