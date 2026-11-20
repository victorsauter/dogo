import { useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import { haptics } from '@/lib/haptics';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { AnchoredMenu, type Anchor } from './AnchoredMenu';
import { Icon } from './Icon';
import { NativeMenuView } from './nativeMenu';
import { PressableScale } from './PressableScale';

export interface ActionMenuAction {
  id: string;
  label: string;
  /** Drawn in red (« Retirer de la balade »). */
  destructive?: boolean;
}

export interface ActionMenuProps {
  /** Accessible name of the « … » button, e.g. « Actions pour Scout ». */
  label: string;
  actions: readonly ActionMenuAction[];
  onAction: (id: string) => void;
  testID?: string;
}

/**
 * Round « … » button (icon only) that opens a menu of actions: the system
 * menu on iOS, elsewhere the app's own menu anchored to the button (the same
 * as `MenuPill`). Choosing an action runs it and closes the menu.
 */
export function ActionMenu({ label, actions, onAction, testID }: ActionMenuProps) {
  const { minTouchSize } = useTheme();
  const anchorRef = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  function choose(id: string) {
    haptics.selection();
    onAction(id);
  }

  const face = <Icon name="more" size={20} color="textMuted" />;
  const box = {
    width: minTouchSize,
    height: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (NativeMenuView) {
    return (
      <NativeMenuView
        testID={testID}
        title={label}
        actions={actions.map((action) => ({
          id: action.id,
          title: action.label,
          attributes: action.destructive ? { destructive: true } : undefined,
        }))}
        onPressAction={({ nativeEvent }) => choose(nativeEvent.event)}
      >
        <View accessible accessibilityRole="button" accessibilityLabel={label} style={box}>
          {face}
        </View>
      </NativeMenuView>
    );
  }

  return (
    <>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t.common.menuPillHint}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setAnchor(null);
          setOpen(true);
          anchorRef.current?.measureInWindow((x, y, width, height) =>
            setAnchor({ x, y, width, height }),
          );
        }}
        style={box}
      >
        <View ref={anchorRef} collapsable={false}>
          {face}
        </View>
      </PressableScale>
      {open ? (
        <AnchoredMenu
          label={label}
          anchor={anchor}
          options={actions.map(({ id, label: text, destructive }) => ({
            value: id,
            label: text,
            destructive,
          }))}
          onChoose={choose}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
