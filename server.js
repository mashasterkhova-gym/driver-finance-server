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

// ─────────────────────────────────────────────────────────────────────────
// BDU CAPTURE — temporary test endpoint to verify {{#A1QVti}} resolution.
//
// It does NOT write to Sheets on purpose: this isolates the single question
// "does the BDU templater resolve the selection_group value?" from any auth
// or wrong-tab noise. It keeps the last 50 hits in memory and echoes back
// whatever arrived in the query string.
//
// Test:
//   1. Point the BDU button's url action at:
//      https://<your-service>.onrender.com/capture?selected={{#A1QVti}}&next=test-module4_l3_s2
//   2. Pick the 2nd item in the selector, tap the button.
//   3. Read the page the browser opens, OR open /capture/log, OR watch Render logs.
//      - selected=ik2a2n  -> the template resolved, you have a working sender.
//      - selected={{#A1QVti}} (literal) or empty -> selection_group is NOT wired
//        to the # provider; fall back to a TextField as the input widget.
// ─────────────────────────────────────────────────────────────────────────
const captures = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

app.all('/capture', (req, res) => {
  const entry = {
    at: new Date().toISOString(),
    method: req.method,
    query: req.query,
    body: req.body && Object.keys(req.body).length ? req.body : undefined,
  };
  captures.unshift(entry);
  if (captures.length > 50) captures.pop();
  console.log('CAPTURE', JSON.stringify(entry));

  // ── PRODUCTION MODE (enable once the template is confirmed) ──
  // Bounce back into the app instead of showing a page, and persist the value.
  //
  // try {
  //   await appendToSheet('CaptureTest', [entry.at, req.query.selected]);
  // } catch (err) {
  //   console.error('Capture sheet append error:', err.message);
  // }
  // const next = req.query.next || 'test-module4_l3_s2';
  // return res.redirect(302, `indriver://open/any/bdu?slug=${encodeURIComponent(next)}&navigation_type=replace`);

  // ── TEST MODE: show what arrived, right in the browser ──
  const rows = Object.entries(req.query)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><meta charset="utf-8"><title>capture</title>
<body style="font-family:system-ui,-apple-system,sans-serif;padding:24px;line-height:1.5">
<h2>Captured ✅</h2>
<p style="color:#666">${escapeHtml(entry.method)} · ${escapeHtml(entry.at)}</p>
<table cellpadding="8" style="border-collapse:collapse;border:1px solid #ddd">
<tr style="background:#f5f5f5"><th align="left">key</th><th align="left">value</th></tr>
${rows || '<tr><td colspan="2">(empty query)</td></tr>'}
</table>
<p style="margin-top:20px;color:#888">If <code>selected</code> shows a literal like
<code>{{#A1QVti}}</code> instead of an item id, the template did not resolve.</p>
</body>`);
});

// View recent captures as JSON (handy if the browser flash is too quick to read).
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
