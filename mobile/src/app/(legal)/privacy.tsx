import { LegalDocument, Screen } from '@/components';
import { t } from '@/strings';

export default function PrivacyScreen() {
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <LegalDocument {...t.legal.privacy} />
    </Screen>
  );
}
