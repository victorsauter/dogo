import { View } from 'react-native';

import { t } from '@/strings';
import type { LegalSection } from '@/strings/legal';
import { useTheme } from '@/theme';

import { Banner } from './Banner';
import { Text } from './Text';

export interface LegalDocumentProps {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}

/** A legal text: the provisional notice first, then the introduction and numbered sections. */
export function LegalDocument({ title, intro, sections }: LegalDocumentProps) {
  const { spacing } = useTheme();
  return (
    <>
      <Banner tone="warning" title={t.legal.provisionalNotice} message={t.legal.placeholdersNote} />
      <Text variant="title">{title}</Text>
      <Text color="textMuted" variant="caption">
        {t.legal.lastUpdate}
      </Text>
      <Text>{intro}</Text>
      {sections.map((section, index) => (
        <View key={section.title} style={{ gap: spacing.sm }}>
          <Text variant="heading">{`${index + 1}. ${section.title}`}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph}>{paragraph}</Text>
          ))}
        </View>
      ))}
    </>
  );
}
