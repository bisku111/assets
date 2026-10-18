import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUp, useAppStore } from '../../state/appStore';
import { Button } from '../../ui/components/Button';
import { Text } from '../../ui/components/Text';
import { colors, spacing } from '../../ui/theme';
import { Campo } from './sign-in';

export default function SignUp() {
  const router = useRouter();
  const errore = useAppStore((s) => s.error);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [attesa, setAttesa] = useState(false);

  const registra = async () => {
    setAttesa(true);
    const ok = await signUp(email.trim(), password, nome.trim() || 'Pianista');
    setAttesa(false);
    if (ok) router.replace('/(onboarding)/level');
  };

  const valido = email.includes('@') && password.length >= 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }}>
          <Text variant="title">Crea il tuo account</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
            Serve solo a ritrovare i progressi quando cambi dispositivo.
          </Text>

          <Campo label="Come ti chiami" value={nome} onChangeText={setNome} autoCapitalize="words" />
          <Campo label="Email" value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
          <Campo label="Password" value={password} onChangeText={setPassword}
            secureTextEntry textContentType="newPassword" />
          <Text variant="caption" tone="faint" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
            Almeno 6 caratteri.
          </Text>

          {errore ? <Text tone="error" style={{ marginBottom: spacing.md }}>{errore}</Text> : null}

          <Button label="Crea account" onPress={registra} loading={attesa} disabled={!valido} />
          <Button label="Indietro" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xs }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
