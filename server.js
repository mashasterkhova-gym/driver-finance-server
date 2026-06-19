// Force IPv4 first for outbound DNS (harmless even if not the cause).
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

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

// ─────────────────────────────────────────────────────────────────────────
// Google Sheets auth WITHOUT googleapis/gaxios/undici.
// We sign the service-account JWT with Node's built-in crypto and talk to
// Google over Node's native https module — which does not throw the
// "Premature close" error that the fetch-based transport was producing.
// No extra npm dependency required.
// ─────────────────────────────────────────────────────────────────────────
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Native HTTPS POST. body: object (JSON) or string (form-encoded).
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(chunks ? JSON.parse(chunks) : {});
            } catch (e) {
              reject(new Error('Bad JSON response: ' + chunks.slice(0, 200)));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('request timeout')));
    req.write(data);
    req.end();
  });
}

// Cache the access token (valid ~1h) so we mint it rarely.
let cachedToken = null; // { token, exp }

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const form =
    'grant_type=' +
    encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
    '&assertion=' +
    jwt;

  const res = await httpsPost(
    'oauth2.googleapis.com',
    '/token',
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    form
  );

  cachedToken = { token: res.access_token, exp: now + (res.expires_in || 3600) };
  return cachedToken.token;
}

async function appendToSheet(sheetName, row) {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${sheetName}!A1`);
  const path =
    `/v4/spreadsheets/${process.env.SPREADSHEET_ID}` +
    `/values/${range}:append?valueInputOption=RAW`;
  await httpsPost(
    'sheets.googleapis.com',
    path,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    { values: [row] }
  );
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────
// BDU CAPTURE (production): persist the answer, then bounce back into the app
// via the BDU deeplink (custom scheme works via redirect on both platforms).
//
// Expected query params (built in BDU via concat):
//   user, nps, comment
// ─────────────────────────────────────────────────────────────────────────
const captures = [];

app.all('/capture', async (req, res) => {
  const { user, nps, comment } = req.query;

  captures.unshift({ at: new Date().toISOString(), query: req.query });
  if (captures.length > 50) captures.pop();
  console.log('CAPTURE', JSON.stringify(req.query));

  // 1) persist - best-effort: a Sheets hiccup must not block the redirect.
  // Create a tab named "CourseEval" with headers: timestamp | user | nps | comment
  try {
    await appendToSheet('CourseEval', [
      new Date().toISOString(),
      user,
      nps,
      comment,
    ]);
  } catch (err) {
    console.error('Capture append error:', err.message);
  }

  // 2) return to the next screen.
  res.redirect(302, 'indriver://open/any/bdu?slug=eg_fininclusion_module1_l1_s9&navigation_type=replace');
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
