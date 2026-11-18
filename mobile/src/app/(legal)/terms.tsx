import { LegalDocument, Screen } from '@/components';
import { t } from '@/strings';

export default function TermsScreen() {
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <LegalDocument {...t.legal.terms} />
    </Screen>
  );
}
