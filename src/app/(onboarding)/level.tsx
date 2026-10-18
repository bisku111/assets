import { useRouter } from 'expo-router';
import { updateProfile } from '../../state/appStore';
import type { SkillLevel } from '../../core/ports/repository';
import { OnboardingStep, Option } from '../../features/onboarding/OnboardingStep';

const LIVELLI: Array<{ key: SkillLevel; title: string; subtitle: string }> = [
  { key: 'never_played', title: 'Non ho mai suonato', subtitle: 'Partiamo dalle cinque dita sulla posizione di DO.' },
  { key: 'beginner', title: 'Sono principiante', subtitle: 'Conosci le note, ti manca scioltezza.' },
  { key: 'plays_already', title: 'So gia suonare', subtitle: 'Due mani insieme e accordi non ti spaventano.' },
  { key: 'advanced', title: 'Sono avanzato', subtitle: 'Cerchi arrangiamenti fedeli e velocita piena.' },
];

export default function LevelStep() {
  const router = useRouter();

  const scegli = async (skillLevel: SkillLevel) => {
    await updateProfile({ skillLevel });
    router.push('/(onboarding)/taste');
  };

  return (
    <OnboardingStep step={1} total={3} question="Quanto sai suonare?"
      hint="Serve a scegliere il livello di partenza dei brani. Potrai cambiarlo quando vuoi.">
      {LIVELLI.map((l) => (
        <Option key={l.key} title={l.title} subtitle={l.subtitle} onPress={() => void scegli(l.key)} />
      ))}
    </OnboardingStep>
  );
}
