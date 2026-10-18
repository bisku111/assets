import { useState } from 'react';
import { useRouter } from 'expo-router';
import { updateProfile, useAppStore } from '../../state/appStore';
import { Button } from '../../ui/components/Button';
import { Text } from '../../ui/components/Text';
import { spacing } from '../../ui/theme';
import { OnboardingStep, Option } from './OnboardingStep';

export default function TasteStep() {
  const router = useRouter();
  const artists = useAppStore((s) => s.artists);
  const [scelti, setScelti] = useState<string[]>([]);

  const alterna = (id: string) =>
    setScelti((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const avanti = async () => {
    await updateProfile({ favoriteArtistIds: scelti });
    router.push('/(onboarding)/goal');
  };

  return (
    <OnboardingStep step={2} total={3} question="Quale musica ti piace?"
      hint="Scegline quanti vuoi. Useremo le tue preferenze per decidere quale repertorio aggiungere per primo.">
      {artists.map((a) => (
        <Option
          key={a.id}
          title={a.name}
          subtitle={a.isPlaceholder ? 'In arrivo: repertorio in attesa di licenza' : a.bio}
          selected={scelti.includes(a.id)}
          onPress={() => alterna(a.id)}
        />
      ))}
      <Text variant="caption" tone="faint" style={{ marginVertical: spacing.md }}>
        Gli artisti segnati come "in arrivo" non hanno ancora brani disponibili:
        stiamo lavorando alle licenze.
      </Text>
      <Button label={scelti.length > 0 ? 'Continua' : 'Salta'} onPress={avanti} />
    </OnboardingStep>
  );
}
