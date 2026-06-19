const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://goal-drive-plan.lovable.app',
    'https://taxi-profit-pal.lovable.app',
    'https://ride-safe-finance.lovable.app',
    'https://ride-earning-buddy.lovable.app',
    'https://ride-smart-pakistan.lovable.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Create the Sheets client ONCE and reuse it across requests. GoogleAuth caches
// the OAuth token internally, so we stop hitting the token endpoint on every
// write — which is where it was failing ("Premature close" on the token fetch).
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Append with a small retry — "Premature close" / ECONNRESET on Google's endpoint
// is usually transient, so a couple of quick retries clears it.
async function appendToSheet(sheetName, row, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────
// BDU CAPTURE (production): persist the answer, then bounce back into the app
// using the deeplink form that matches the caller's platform.
//
//   Android : indriver://open/any/bdu?slug=...&navigation_type=...
//   iOS/else: https://indrive.com/app/bdu?slug=...&navigation_type=...   (note: different path)
//
// Expected query params (built in BDU via concat):
//   user, nps, comment, platform
// ─────────────────────────────────────────────────────────────────────────
const captures = [];

app.all('/capture', async (req, res) => {
  const { user, nps, comment, platform } = req.query;

  captures.unshift({ at: new Date().toISOString(), query: req.query });
  if (captures.length > 50) captures.pop();
  console.log('CAPTURE', JSON.stringify(req.query));

  // 1) persist - best-effort: a Sheets hiccup must not block the redirect.
  // Create a tab named "CourseEval" with headers: timestamp | user | nps | comment | platform
  try {
    await appendToSheet('CourseEval', [
      new Date().toISOString(),
      user,
      nps,
      comment,
      platform,
    ]);
  } catch (err) {
    console.error('Capture append error:', err.message);
  }

  // 2) platform-specific return deeplink — fixed next screen
  //    Android -> custom scheme, everything else -> https universal link
  const platformStr = String(platform || '').toLowerCase();
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const isAndroid = platformStr ? platformStr.includes('android') : ua.includes('android');

  const target = isAndroid
    ? 'indriver://open/any/bdu?slug=eg_fininclusion_module1_l1_s9&navigation_type=replace'
    : 'indriver://open/any/bdu?slug=eg_fininclusion_module1_l1_s9&navigation_type=replace';

  res.redirect(302, target);
});

// View recent captures as JSON (debugging).
app.get('/capture/log', (_req, res) => {
  res.json(captures);
});

// goal-drive-plan.lovable.app
app.post('/submit', async (req, res) => {
  const {
    goal,
    goal_amount,
    vehicle_type,
    hours_per_day,
    days_per_week,
    savings_intensity_pct,
    estimated_monthly_profit,
    daily_savings,
    weekly_savings,
    months_to_goal,
    nps_score,
  } = req.body;

  const row = [
    new Date().toISOString(),
    goal,
    goal_amount,
    vehicle_type,
    hours_per_day,
    days_per_week,
    savings_intensity_pct,
    estimated_monthly_profit,
    daily_savings,
    weekly_savings,
    months_to_goal,
    nps_score,
  ];

  try {
    await appendToSheet('Sheet1', row);
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// taxi-profit-pal.lovable.app
app.post('/submit-taxi', async (req, res) => {
  const {
    period,
    owns_vehicle,
    gross_income,
    fuel_cost,
    rent_or_repairs,
    commission,
    net_income,
    nps_score,
  } = req.body;

  const row = [
    new Date().toISOString(),
    period,
    owns_vehicle,
    gross_income,
    fuel_cost,
    rent_or_repairs,
    commission,
    net_income,
    nps_score,
  ];

  try {
    await appendToSheet('TaxiProfitPal', row);
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ride-safe-finance.lovable.app
app.post('/submit-loan', async (req, res) => {
  const {
    loan_amount,
    tenure_months,
    markup_rate,
    monthly_income,
    expense_percent,
    monthly_installment,
    money_left,
    nps_score,
  } = req.body;

  const row = [
    new Date().toISOString(),
    loan_amount,
    tenure_months,
    markup_rate,
    monthly_income,
    expense_percent,
    monthly_installment,
    money_left,
    nps_score,
  ];

  try {
    await appendToSheet('LoanCalculator', row);
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// earnings calculator
app.post('/submit-earnings', async (req, res) => {
  const {
    vehicle,
    hours_per_day,
    days_per_week,
    daily_earnings,
    weekly_earnings,
    monthly_earnings,
    nps_score,
  } = req.body;

  const row = [
    new Date().toISOString(),
    vehicle,
    hours_per_day,
    days_per_week,
    daily_earnings,
    weekly_earnings,
    monthly_earnings,
    nps_score,
  ];

  try {
    await appendToSheet('EarningsCalculator', row);
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ride-smart-pakistan.lovable.app
app.post('/submit-smart', async (req, res) => {
  const { selected_request, correct, nps_score } = req.body;
  const row = [new Date().toISOString(), selected_request, correct, nps_score];
  try {
    await appendToSheet('RideSmart', row);
    res.json({ success: true });
  } catch (err) {
    console.error('Sheets append error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
