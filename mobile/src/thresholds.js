import AsyncStorage from '@react-native-async-storage/async-storage';

const THRESHOLDS_KEY = 'soft_landing_thresholds';
export const DEFAULT_THRESHOLDS = { low: 100, comfortable: 500 };

export async function getStoredThresholds() {
  try {
    const raw = await AsyncStorage.getItem(THRESHOLDS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Number.isFinite(parsed.low) && Number.isFinite(parsed.comfortable)) {
      return parsed;
    }
  } catch (err) {
    // fall through
  }
  return null;
}

export function saveThresholds(low, comfortable) {
  return AsyncStorage.setItem(THRESHOLDS_KEY, JSON.stringify({ low, comfortable }));
}

export function totalAvailableBalance(accounts) {
  return accounts.reduce((sum, account) => {
    const amount = account.balances.available ?? account.balances.current ?? 0;
    return sum + amount;
  }, 0);
}

export function classifyBalance(total, thresholds) {
  if (total < thresholds.low) return 'low';
  if (total < thresholds.comfortable) return 'tight';
  return 'comfortable';
}
