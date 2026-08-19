const linkButton = document.getElementById('link-button');
const statusEl = document.getElementById('status');
const statusCard = document.getElementById('status-card');
const statusLabel = statusCard.querySelector('.status-label');
const balanceContainer = document.getElementById('balance-container');
const balanceList = document.getElementById('balance-list');

const lowThresholdInput = document.getElementById('low-threshold');
const comfortableThresholdInput = document.getElementById('comfortable-threshold');
const saveThresholdsButton = document.getElementById('save-thresholds');
const thresholdFeedback = document.getElementById('threshold-feedback');

const THRESHOLDS_KEY = 'soft_landing_thresholds';
const DEFAULT_THRESHOLDS = { low: 100, comfortable: 500 };

let latestAccounts = null;
// Suggested thresholds estimated from recent spending. Only used until the
// user saves their own — never persisted, since a saved choice always wins.
let smartDefaults = null;

function getStoredThresholds() {
  try {
    const stored = JSON.parse(localStorage.getItem(THRESHOLDS_KEY));
    if (stored && Number.isFinite(stored.low) && Number.isFinite(stored.comfortable)) {
      return stored;
    }
  } catch (err) {
    // fall through
  }
  return null;
}

function getThresholds() {
  return getStoredThresholds() || smartDefaults || DEFAULT_THRESHOLDS;
}

function applyThresholdsToInputs(thresholds) {
  lowThresholdInput.value = thresholds.low;
  comfortableThresholdInput.value = thresholds.comfortable;
}

applyThresholdsToInputs(getThresholds());

saveThresholdsButton.addEventListener('click', () => {
  const low = Number(lowThresholdInput.value);
  const comfortable = Number(comfortableThresholdInput.value);

  if (!Number.isFinite(low) || !Number.isFinite(comfortable) || low < 0 || comfortable < 0) {
    thresholdFeedback.textContent = 'Please enter valid amounts.';
    return;
  }
  if (low >= comfortable) {
    thresholdFeedback.textContent = '"Low" must be less than "Comfortable".';
    return;
  }

  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify({ low, comfortable }));
  thresholdFeedback.textContent = 'Saved.';

  if (latestAccounts) {
    updateStatusCard(latestAccounts);
  }
});

async function createLinkToken() {
  const response = await fetch('/api/create_link_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'web' }),
  });
  if (!response.ok) throw new Error('Failed to create link token');
  const data = await response.json();
  return data.link_token;
}

async function exchangePublicToken(publicToken) {
  const response = await fetch('/api/exchange_public_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  });
  if (!response.ok) throw new Error('Failed to exchange public token');
}

async function fetchBalance() {
  const response = await fetch('/api/balance');
  if (!response.ok) throw new Error('Failed to fetch balance');
  const data = await response.json();
  return data.accounts;
}

async function fetchSpendingEstimate() {
  const response = await fetch('/api/spending-estimate');
  if (!response.ok) return null;
  return response.json();
}

function formatCurrency(amount, isoCurrencyCode) {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: isoCurrencyCode || 'USD',
  }).format(amount);
}

function totalAvailableBalance(accounts) {
  return accounts.reduce((sum, account) => {
    const amount = account.balances.available ?? account.balances.current ?? 0;
    return sum + amount;
  }, 0);
}

function classifyBalance(total, thresholds) {
  if (total < thresholds.low) return 'low';
  if (total < thresholds.comfortable) return 'tight';
  return 'comfortable';
}

const STATUS_TEXT = {
  low: 'Low',
  tight: 'Tight',
  comfortable: 'Comfortable',
};

function updateStatusCard(accounts) {
  const total = totalAvailableBalance(accounts);
  const status = classifyBalance(total, getThresholds());

  statusCard.classList.remove('status-low', 'status-tight', 'status-comfortable');
  statusCard.classList.add(`status-${status}`);
  statusLabel.textContent = `${STATUS_TEXT[status]} — tap to view balance`;
  statusCard.classList.remove('hidden');
}

function renderBalances(accounts) {
  balanceList.innerHTML = '';
  accounts.forEach((account) => {
    const li = document.createElement('li');
    const amount = account.balances.available ?? account.balances.current;
    li.textContent = `${account.name} (••${account.mask}): ${formatCurrency(
      amount,
      account.balances.iso_currency_code
    )}`;
    balanceList.appendChild(li);
  });
  balanceContainer.classList.remove('hidden');
}

statusCard.addEventListener('click', () => {
  if (!latestAccounts) return;
  renderBalances(latestAccounts);
  statusCard.classList.add('hidden');
});

function buildHandler(linkToken, receivedRedirectUri) {
  return Plaid.create({
    token: linkToken,
    receivedRedirectUri,
    onSuccess: async (publicToken) => {
      try {
        statusEl.textContent = '';
        await exchangePublicToken(publicToken);
        latestAccounts = await fetchBalance();

        if (!getStoredThresholds()) {
          try {
            const estimate = await fetchSpendingEstimate();
            if (estimate && estimate.low > 0 && estimate.low < estimate.comfortable) {
              smartDefaults = estimate;
              applyThresholdsToInputs(smartDefaults);
              thresholdFeedback.textContent = 'Suggested from your recent spending — adjust anytime.';
            }
          } catch (err) {
            console.error(err);
            // Smart defaults are a bonus, not required — silently keep the fallback.
          }
        }

        updateStatusCard(latestAccounts);
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'Something went wrong while connecting your bank.';
      } finally {
        linkButton.disabled = false;
        sessionStorage.removeItem('plaid_link_token');
      }
    },
    onExit: (err) => {
      linkButton.disabled = false;
      sessionStorage.removeItem('plaid_link_token');
      if (err) {
        console.error(err);
        statusEl.textContent = 'Connection was not completed.';
      } else {
        statusEl.textContent = '';
      }
    },
  });
}

linkButton.addEventListener('click', async () => {
  linkButton.disabled = true;
  statusEl.textContent = 'Connecting…';
  statusCard.classList.add('hidden');
  balanceContainer.classList.add('hidden');
  latestAccounts = null;
  smartDefaults = null;

  try {
    const linkToken = await createLinkToken();
    sessionStorage.setItem('plaid_link_token', linkToken);
    buildHandler(linkToken).open();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not start the connection. Please try again.';
    linkButton.disabled = false;
  }
});

// If Plaid redirected back here after an OAuth bank hand-off (UK/Open Banking
// institutions always redirect, even in sandbox), resume the same Link session
// using the token we stashed before the redirect.
if (window.location.search.includes('oauth_state_id=')) {
  const linkToken = sessionStorage.getItem('plaid_link_token');
  if (linkToken) {
    statusEl.textContent = 'Finishing connection…';
    linkButton.disabled = true;
    buildHandler(linkToken, window.location.href).open();
  }
}
