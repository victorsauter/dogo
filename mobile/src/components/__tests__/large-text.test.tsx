import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { t } from '@/strings';
import { setFontScale, setFontScaleLive } from '@/test/fontScale';
import { otherDog, participant, testDog, walkResult } from '@/test/fixtures';
import { renderWithTheme } from '@/test/render';
import { isLargeText, LARGE_TEXT_SCALE, scaledSize } from '@/theme';

import { Avatar } from '../Avatar';
import { DateTimeField } from '../DateTimeField';
import { DogCard } from '../DogCard';
import { ListItem } from '../ListItem';
import { MessageComposer } from '../MessageComposer';
import { ParticipantRow } from '../ParticipantRow';
import { TextField } from '../TextField';
import { WalkCard } from '../WalkCard';

/**
 * Text enlarged in the system's accessibility settings (iOS « Texte plus grand »,
 * Android « Taille de police »): layouts give way rather than cut text short.
 */
const LARGE = 2.5;

const longTitle = 'Grande balade du dimanche matin autour des étangs de Seppois avec pique-nique';

describe('line limits', () => {
  it('cuts a walk title at two lines at the normal size, and shows it whole when enlarged', async () => {
    setFontScale(1);
    await renderWithTheme(<WalkCard walk={walkResult({ title: longTitle })} onPress={() => {}} />);
    expect(screen.getByText(longTitle).props.numberOfLines).toBe(2);
    expect(screen.getByText(/Entrée du parc/).props.numberOfLines).toBe(1);

    await setFontScaleLive(LARGE);
    expect(screen.getByText(longTitle).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(/Entrée du parc/).props.numberOfLines).toBeUndefined();
  });

  it('keeps the threshold in one place', async () => {
    setFontScale(LARGE_TEXT_SCALE - 0.01);
    await renderWithTheme(<WalkCard walk={walkResult({ title: longTitle })} onPress={() => {}} />);
    expect(screen.getByText(longTitle).props.numberOfLines).toBe(2);
    await setFontScaleLive(LARGE_TEXT_SCALE);
    expect(screen.getByText(longTitle).props.numberOfLines).toBeUndefined();
  });

  it('takes Android « 130 % », reported as 1.2999999523, for large text', () => {
    expect(isLargeText(1.2999999523162842)).toBe(true);
    expect(isLargeText(LARGE_TEXT_SCALE)).toBe(true);
    expect(isLargeText(1.15)).toBe(false);
    expect(isLargeText(LARGE_TEXT_SCALE - 0.01)).toBe(false);
  });

  it('shows a dog card and a list row whole when enlarged', async () => {
    setFontScale(LARGE);
    await renderWithTheme(
      <>
        <DogCard dog={{ ...testDog, name: 'Mademoiselle Biscotte de la Forêt' }} />
        <ListItem title="Une entrée de liste au titre très long" subtitle="Et son sous-titre" />
      </>,
    );
    expect(screen.getByText('Mademoiselle Biscotte de la Forêt').props.numberOfLines).toBe(
      undefined,
    );
    expect(screen.getByText('Une entrée de liste au titre très long').props.numberOfLines).toBe(
      undefined,
    );
    expect(screen.getByText('Et son sous-titre').props.numberOfLines).toBeUndefined();
  });
});

describe('participant row', () => {
  it('cuts the dog and owner lines at one line at the normal size, shows them whole when enlarged', async () => {
    setFontScale(1);
    await renderWithTheme(
      <ParticipantRow
        participant={participant({ ...otherDog, name: 'Mademoiselle Biscotte de la Forêt' }, 'r1')}
        onOpenDog={() => {}}
        onOpenOwner={() => {}}
      />,
    );
    expect(screen.getByText('Mademoiselle Biscotte de la Forêt').props.numberOfLines).toBe(1);
    expect(screen.getByText(/Hugo Bernard · Petit/).props.numberOfLines).toBe(1);

    await setFontScaleLive(LARGE);
    expect(screen.getByText('Mademoiselle Biscotte de la Forêt').props.numberOfLines).toBe(
      undefined,
    );
    expect(screen.getByText(/Hugo Bernard · Petit/).props.numberOfLines).toBeUndefined();
  });
});

describe('avatar', () => {
  it('keeps its initials inside its circle: they do not follow the text size', async () => {
    setFontScale(LARGE);
    await renderWithTheme(<Avatar name="Léa Martin" size={48} />);
    const letters = screen.getByText('LM');
    expect(letters.props.allowFontScaling).toBe(false);
    // And the picture is never squeezed by a row of enlarged text.
    const circle = screen.getByLabelText('Photo de Léa Martin');
    expect(StyleSheet.flatten(circle.props.style)).toMatchObject({
      width: 48,
      height: 48,
      flexShrink: 0,
    });
  });
});

describe('time and date field', () => {
  const field = (
    <DateTimeField
      label="Date et heure"
      value={new Date(2026, 10, 25, 10, 0)}
      onChange={() => {}}
      dateA11yLabel="Choisir la date"
      timeA11yLabel="Choisir l’heure"
    />
  );
  /** The container of the two buttons. */
  const row = () => screen.getByRole('button', { name: /Choisir la date/ }).parent!.parent!;

  it('puts the day and the time side by side at the normal size', async () => {
    setFontScale(1);
    await renderWithTheme(field);
    expect(StyleSheet.flatten(row().props.style).flexDirection).toBe('row');
  });

  it('stacks them when enlarged, so « 10:00 » is not cut to « 10:0 »', async () => {
    setFontScale(LARGE);
    await renderWithTheme(field);
    expect(StyleSheet.flatten(row().props.style).flexDirection).toBe('column');
    expect(screen.getByRole('button', { name: /Choisir l’heure : 10:00/ })).toBeTruthy();
  });
});

describe('text fields', () => {
  const minHeightOf = (label: string) =>
    StyleSheet.flatten(screen.getByLabelText(label).props.style).minHeight as number;

  it('have a minimum height that grows with the text, never a fixed height', async () => {
    setFontScale(1);
    await renderWithTheme(
      <>
        <TextField label="Nom" value="" onChangeText={() => {}} />
        <TextField label="Description" value="" onChangeText={() => {}} multiline />
      </>,
    );
    const normal = { single: minHeightOf('Nom'), multi: minHeightOf('Description') };
    expect(normal).toEqual({ single: 48, multi: 120 });

    await setFontScaleLive(LARGE);
    expect(minHeightOf('Nom')).toBeGreaterThan(normal.single);
    expect(minHeightOf('Description')).toBeGreaterThan(normal.multi);
    for (const label of ['Nom', 'Description']) {
      expect(StyleSheet.flatten(screen.getByLabelText(label).props.style)).not.toHaveProperty(
        'height',
      );
    }
  });

  it('stop growing at a reasonable factor, where the layout could not follow', () => {
    expect(scaledSize(48, 1)).toBe(48);
    expect(scaledSize(48, 0.8)).toBe(48);
    expect(scaledSize(48, 1.5)).toBe(72);
    expect(scaledSize(48, 3.1)).toBe(96);
    expect(scaledSize(120, 3.1, 3)).toBe(360);
  });

  it('the thread composer keeps room for several lines of enlarged text', async () => {
    const heights = () => {
      const style = StyleSheet.flatten(screen.getByLabelText(t.thread.composerLabel).props.style);
      return { min: style.minHeight as number, max: style.maxHeight as number };
    };
    setFontScale(1);
    await renderWithTheme(<MessageComposer onSend={() => {}} />);
    expect(heights()).toEqual({ min: 48, max: 120 });
    await setFontScaleLive(LARGE);
    expect(heights().min).toBeGreaterThan(48);
    expect(heights().max).toBeGreaterThan(120);
  });
});
