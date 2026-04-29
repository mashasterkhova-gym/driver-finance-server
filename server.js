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

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function appendToSheet(sheetName, row) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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
