import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk';

import {
  createLinkToken,
  exchangePublicToken,
  fetchBalance,
  fetchSpendingEstimate,
} from './src/api';
import {
  DEFAULT_THRESHOLDS,
  classifyBalance,
  getStoredThresholds,
  saveThresholds,
  totalAvailableBalance,
} from './src/thresholds';

const STATUS_TEXT = { low: 'Low', tight: 'Tight', comfortable: 'Comfortable' };
const STATUS_COLORS = {
  low: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444' },
  tight: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', dot: '#f59e0b' },
  comfortable: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e' },
};

function formatCurrency(amount, isoCurrencyCode) {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: isoCurrencyCode || 'GBP',
  }).format(amount);
}

export default function App() {
  const [connecting, setConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [accounts, setAccounts] = useState(null);
  const [status, setStatus] = useState(null);
  const [balanceRevealed, setBalanceRevealed] = useState(false);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [lowInput, setLowInput] = useState(String(DEFAULT_THRESHOLDS.low));
  const [comfortableInput, setComfortableInput] = useState(String(DEFAULT_THRESHOLDS.comfortable));
  const [thresholdFeedback, setThresholdFeedback] = useState('');

  async function computeStatus(fetchedAccounts) {
    const stored = await getStoredThresholds();
    let thresholds = stored;

    if (!stored) {
      const estimate = await fetchSpendingEstimate();
      if (estimate && estimate.low > 0 && estimate.low < estimate.comfortable) {
        thresholds = estimate;
        setLowInput(String(estimate.low));
        setComfortableInput(String(estimate.comfortable));
        setThresholdFeedback('Suggested from your recent spending — adjust anytime.');
      } else {
        thresholds = DEFAULT_THRESHOLDS;
      }
    }

    const total = totalAvailableBalance(fetchedAccounts);
    setStatus(classifyBalance(total, thresholds));
  }

  async function handleConnect() {
    setConnecting(true);
    setStatusMessage('Connecting…');
    setAccounts(null);
    setStatus(null);
    setBalanceRevealed(false);

    try {
      const token = await createLinkToken();
      const session = await createPlaidLinkSession({
        token,
        onSuccess: async (success) => {
          try {
            setStatusMessage('');
            await exchangePublicToken(success.publicToken);
            const fetchedAccounts = await fetchBalance();
            setAccounts(fetchedAccounts);
            await computeStatus(fetchedAccounts);
          } catch (err) {
            console.error(err);
            setStatusMessage('Something went wrong while connecting your bank.');
          } finally {
            setConnecting(false);
          }
        },
        onExit: (exit) => {
          setConnecting(false);
          if (exit?.error) {
            console.error(exit.error);
            setStatusMessage('Connection was not completed.');
          } else {
            setStatusMessage('');
          }
        },
      });
      await session.open();
    } catch (err) {
      console.error(err);
      setStatusMessage('Could not start the connection. Please try again.');
      setConnecting(false);
    }
  }

  async function handleSaveThresholds() {
    const low = Number(lowInput);
    const comfortable = Number(comfortableInput);

    if (!Number.isFinite(low) || !Number.isFinite(comfortable) || low < 0 || comfortable < 0) {
      setThresholdFeedback('Please enter valid amounts.');
      return;
    }
    if (low >= comfortable) {
      setThresholdFeedback('"Low" must be less than "Comfortable".');
      return;
    }

    await saveThresholds(low, comfortable);
    setThresholdFeedback('Saved.');

    if (accounts) {
      const total = totalAvailableBalance(accounts);
      setStatus(classifyBalance(total, { low, comfortable }));
    }
  }

  const colors = status ? STATUS_COLORS[status] : null;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <Text style={styles.title}>Soft Landing</Text>
        <Text style={styles.subtitle}>Connect your bank to see where you stand.</Text>

        <Pressable onPress={() => setThresholdsOpen((open) => !open)}>
          <Text style={styles.settingsToggle}>
            {thresholdsOpen ? '▾' : '▸'} Set your comfort levels
          </Text>
        </Pressable>

        {thresholdsOpen && (
          <View style={styles.thresholdForm}>
            <Text style={styles.label}>Low is below £</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={lowInput}
              onChangeText={setLowInput}
            />
            <Text style={styles.label}>Comfortable is above £</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={comfortableInput}
              onChangeText={setComfortableInput}
            />
            <Pressable style={styles.saveButton} onPress={handleSaveThresholds}>
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
            {!!thresholdFeedback && <Text style={styles.feedback}>{thresholdFeedback}</Text>}
          </View>
        )}

        <Pressable
          style={[styles.linkButton, connecting && styles.linkButtonDisabled]}
          onPress={handleConnect}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.linkButtonText}>Connect your bank</Text>
          )}
        </Pressable>

        {!!statusMessage && <Text style={styles.statusMessage}>{statusMessage}</Text>}

        {status && !balanceRevealed && (
          <Pressable
            style={[
              styles.statusCard,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
            onPress={() => setBalanceRevealed(true)}
          >
            <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
            <Text style={[styles.statusCardText, { color: colors.text }]}>
              {STATUS_TEXT[status]} — tap to view balance
            </Text>
          </Pressable>
        )}

        {balanceRevealed && accounts && (
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceHeading}>Account Balances</Text>
            {accounts.map((account) => {
              const amount = account.balances.available ?? account.balances.current;
              return (
                <Text key={account.account_id} style={styles.balanceRow}>
                  {account.name} (••{account.mask}):{' '}
                  {formatCurrency(amount, account.balances.iso_currency_code)}
                </Text>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6fa',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  settingsToggle: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 8,
  },
  thresholdForm: {
    marginBottom: 16,
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 13,
  },
  feedback: {
    color: '#166534',
    fontSize: 13,
    marginTop: 4,
  },
  linkButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkButtonDisabled: {
    opacity: 0.6,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  statusMessage: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusCardText: {
    fontSize: 14,
  },
  balanceContainer: {
    marginTop: 20,
  },
  balanceHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  balanceRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    color: '#1a1a2e',
  },
});
