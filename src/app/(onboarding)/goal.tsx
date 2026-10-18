import { useRouter } from 'expo-router';
import { updateProfile } from '../../state/appStore';
import { OnboardingStep, Option } from '../../features/onboarding/OnboardingStep';

const OBIETTIVI = [
  { minutes: 5, title: '5 minuti al giorno', subtitle: "Poco ma tutti i giorni: funziona più di un'ora ogni tanto." },
  { minutes: 10, title: '10 minuti al giorno', subtitle: 'Il ritmo giusto per imparare un brano a settimana.' },
  { minutes: 20, title: '20 minuti al giorno', subtitle: 'Si vedono progressi rapidi.' },
  { minutes: 30, title: '30 minuti o più', subtitle: 'Fai sul serio.' },
];

export default function GoalStep() {
  const router = useRouter();

  const scegli = async (dailyGoalMinutes: number) => {
    // Qui finisce l'onboarding: da adesso la radice manda l'utente alla Home.
    await updateProfile({ dailyGoalMinutes, onboardingCompleted: true });
    router.replace('/(tabs)');
  };

  return (
    <OnboardingStep step={3} total={3} question="Quanto vuoi esercitarti?"
      hint="Un obiettivo piccolo e rispettato vale più di uno grande e abbandonato.">
      {OBIETTIVI.map((o) => (
        <Option key={o.minutes} title={o.title} subtitle={o.subtitle} onPress={() => void scegli(o.minutes)} />
      ))}
    </OnboardingStep>
  );
}
