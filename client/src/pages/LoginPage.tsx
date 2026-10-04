import { useState } from 'react';
import { Alert, Anchor, Button, Card, Center, PasswordInput, Stack, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { authClient, syntheticEmail } from '../lib/auth';
import { keys } from '../lib/queries';

type Mode = 'signin' | 'signup' | 'reset';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,32}$/;

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Off when the page is opened through the Cloudflare tunnel (see SIGNUP_AND_RESET on the server).
  const { data: options } = useQuery({
    queryKey: ['login-options'],
    queryFn: () => api.get<{ selfService: boolean }>('/api/account/login-options'),
    staleTime: Infinity,
  });
  const selfService = options?.selfService ?? false;

  const form = useForm({
    initialValues: { username: '', password: '', confirm: '' },
    validate: {
      username: (v) => (USERNAME_RE.test(v.trim()) ? null : '3–32 characters: letters, numbers, _ or .'),
      password: (v) => (mode === 'signin' || v.length >= 8 ? null : 'At least 8 characters'),
      confirm: (v, values) => (mode === 'signin' || v === values.password ? null : 'Passwords do not match'),
    },
  });

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    form.setFieldValue('password', '');
    form.setFieldValue('confirm', '');
    form.clearErrors();
  };

  const finishSignIn = async () => {
    await qc.invalidateQueries({ queryKey: keys.me });
    navigate('/', { replace: true });
  };

  const submit = form.onSubmit(async ({ username, password }) => {
    setBusy(true);
    setError(null);
    const name = username.trim();
    try {
      if (mode === 'signin') {
        const { error } = await authClient.signIn.username({
          username: name,
          password,
        });
        if (error) throw new Error(error.message ?? 'Invalid username or password');
        await finishSignIn();
      } else if (mode === 'signup') {
        const { error } = await authClient.signUp.email({
          email: syntheticEmail(name),
          password,
          name,
          username: name,
        });
        if (error) throw new Error(error.message ?? 'Could not create account');
        await finishSignIn();
      } else {
        await api.post('/api/account/reset-password', {
          username: name,
          newPassword: password,
        });
        notifications.show({
          color: 'teal',
          message: 'Password updated, you can sign in now.',
        });
        switchMode('signin');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  });

  return (
    <Center mih="100vh" p="md">
      <Card w="100%" maw={400} shadow="sm">
        <Stack gap="md">
          <div>
            <Title order={2}>Budget Tracker</Title>
            <Text c="dimmed" size="sm">
              {mode === 'reset' ? 'Choose a new password for your account.' : 'Sign in to track your spending.'}
            </Text>
          </div>

          {selfService && mode !== 'reset' && (
            <Tabs value={mode} onChange={(v) => switchMode(v as Mode)}>
              <Tabs.List grow>
                <Tabs.Tab value="signin">Sign in</Tabs.Tab>
                <Tabs.Tab value="signup">Sign up</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          )}

          {error && (
            <Alert color="red" icon={<IconAlertCircle size={18} />}>
              {error}
            </Alert>
          )}

          <form onSubmit={submit}>
            <Stack gap="sm">
              <TextInput label="Username" autoComplete="username" autoFocus {...form.getInputProps('username')} />
              <PasswordInput
                label={mode === 'reset' ? 'New password' : 'Password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                {...form.getInputProps('password')}
              />
              {mode !== 'signin' && (
                <PasswordInput
                  label="Confirm password"
                  autoComplete="new-password"
                  {...form.getInputProps('confirm')}
                />
              )}
              <Button type="submit" loading={busy} fullWidth mt="xs">
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </Button>
            </Stack>
          </form>

          {selfService && (
            <Text size="sm" ta="center">
              {mode === 'reset' ? (
                <Anchor component="button" type="button" onClick={() => switchMode('signin')}>
                  Back to sign in
                </Anchor>
              ) : (
                <Anchor component="button" type="button" onClick={() => switchMode('reset')}>
                  Forgot password?
                </Anchor>
              )}
            </Text>
          )}
        </Stack>
      </Card>
    </Center>
  );
}
