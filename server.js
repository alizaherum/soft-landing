require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

// Demo-only single-user storage. Replace with per-user persistence before adding real users.
let accessToken = null;

app.post('/api/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: `user-${Date.now()}` },
      client_name: 'Soft Landing',
      products: [Products.Auth, Products.Transactions],
      country_codes: [CountryCode.Gb],
      language: 'en',
      redirect_uri: process.env.PLAID_REDIRECT_URI,
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

app.post('/api/exchange_public_token', async (req, res) => {
  const { public_token } = req.body;
  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required' });
  }
  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    accessToken = response.data.access_token;
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

app.get('/api/balance', async (req, res) => {
  if (!accessToken) {
    return res.status(400).json({ error: 'No linked bank account yet' });
  }
  try {
    const response = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    res.json({ accounts: response.data.accounts });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

app.get('/api/spending-estimate', async (req, res) => {
  if (!accessToken) {
    return res.status(400).json({ error: 'No linked bank account yet' });
  }
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const toIsoDate = (date) => date.toISOString().slice(0, 10);

    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: toIsoDate(startDate),
      end_date: toIsoDate(endDate),
    });

    // Positive amount = money leaving the account (a spend), per Plaid's convention.
    const totalSpend = response.data.transactions
      .filter((txn) => !txn.pending && txn.amount > 0)
      .reduce((sum, txn) => sum + txn.amount, 0);

    const dailyAverage = totalSpend / 30;
    res.json({
      low: Math.round(dailyAverage * 7),
      comfortable: Math.round(dailyAverage * 30),
    });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Failed to estimate spending' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Soft Landing server running on port ${PORT}`));
