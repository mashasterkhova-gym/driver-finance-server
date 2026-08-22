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
// Per-screen capture config for NEW screens (route: /capture/<key>).
//   tab        -> Google Sheet tab name (create it; headers = columns below)
//   columns    -> column order. 'timestamp' is auto-filled; every other name
//                 must match a query-param sent from the BDU concat URL.
//   labels     -> optional per-column id->text maps. selection_group sends item
//                 ids (which are reused across groups), so the map MUST be
//                 scoped per column. Unmapped values fall through, stored as-is.
//   noRedirect -> true = stay on the screen (e.g. a snackbar confirms the save).
//                 Server returns 204 and does NOT navigate; 'next'/'navType'
//                 are then unused.
//   next       -> slug of the BDU screen to return to after saving.
//   navType    -> BDU navigation_type for the return bounce (default 'replace').
// NOTE: course-eval is NOT here — it stays on the legacy /capture route below
// so its already-deployed button (which hits /capture, no key) keeps working.
// ─────────────────────────────────────────────────────────────────────────
const CAPTURES = {
  'stem-form': {
    tab: 'StemForm',
    columns: ['timestamp', 'user', 'name', 'child_name', 'phone',
              'age_group', 'smartphone', 'days', 'time_slot', 'location'],
    labels: {
      age_group:  { Y4dzU6: '8–10',     uqCnnW: '11–13',     HKJ0xx: '14–18' },
      smartphone: { Y4dzU6: 'Yes',      uqCnnW: 'No' },
      days:       { Y4dzU6: 'Weekdays', uqCnnW: 'Weekends' },
      time_slot:  { Y4dzU6: 'Morning',  uqCnnW: 'Afternoon', HKJ0xx: 'Evening' },
      location:   { Y4dzU6: 'DHA',      uqCnnW: 'Shadman',
                    HKJ0xx: 'Civic Center Township Commercial Area Lahore' },
    },
    next: 'stem_card10',
    navType: 'present',
  },
  'course-survey': {
    tab: 'CourseEval',
    columns: ['timestamp', 'user', 'q1', 'q2', 'q3', 'q4'],
    next: 'eg_surveycomplete',
    navType: 'present',
  },
  'course-survey-m4': {
    tab: 'CourseSurveyM4',
    columns: ['timestamp', 'user', 'q1', 'q2', 'q3', 'q4'],
    next: 'pa_fininclusion_module4_l3_s8_success',
    navType: 'present',
  },
  'course-survey-mexico': {
    tab: 'CourseSurveyMx',
    columns: ['timestamp', 'user', 'q1', 'q2', 'q3', 'q4'],
    next: 'mx_surveycomplete',
    navType: 'present',
  },
  // add new screens here
};

// ─────────────────────────────────────────────────────────────────────────
// BDU CAPTURE (production): persist the answer, then bounce back into the app
// via the BDU deeplink (custom scheme works via redirect on both platforms).
// ─────────────────────────────────────────────────────────────────────────
const captures = [];

// Legacy single-screen capture for course-eval. Button URL: /capture (no key).
// Left untouched so the deployed course-eval screen keeps working.
//   Expected query params (built in BDU via concat): user, nps, comment
//   Tab "CourseEval" with headers: timestamp | user | nps | comment
app.all('/capture', async (req, res) => {
  const { user, nps, comment } = req.query;

  captures.unshift({ at: new Date().toISOString(), key: 'course-eval', query: req.query });
  if (captures.length > 50) captures.pop();
  console.log('CAPTURE', JSON.stringify(req.query));

  // 1) persist - best-effort: a Sheets hiccup must not block the redirect.
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
// MUST stay registered BEFORE /capture/:key, or :key would swallow "log".
app.get('/capture/log', (_req, res) => {
  res.json(captures);
});

// Config-driven capture for new screens: /capture/<key>
app.all('/capture/:key', async (req, res) => {
  const cfg = CAPTURES[req.params.key];
  if (!cfg) {
    res.status(404).json({ error: 'unknown capture key: ' + req.params.key });
    return;
  }

  captures.unshift({ at: new Date().toISOString(), key: req.params.key, query: req.query });
  if (captures.length > 50) captures.pop();
  console.log('CAPTURE', req.params.key, JSON.stringify(req.query));

  // Build the row; translate ids to text where a per-column label map exists.
  const row = cfg.columns.map((c) => {
    if (c === 'timestamp') return new Date().toISOString();
    const raw = req.query[c] ?? '';
    const map = cfg.labels && cfg.labels[c];
    return map ? (map[raw] ?? raw) : raw; // unmapped id -> stored as-is
  });

  // best-effort: a Sheets hiccup must not block the response.
  try {
    await appendToSheet(cfg.tab, row);
  } catch (err) {
    console.error('Capture append error:', err.message);
  }

  // Stay on the screen (e.g. a snackbar confirms the save) — quiet 204, no nav.
  if (cfg.noRedirect) {
    res.status(204).end();
    return;
  }

  res.redirect(
    302,
    `indriver://open/any/bdu?slug=${encodeURIComponent(cfg.next)}` +
    `&navigation_type=${cfg.navType || 'replace'}`
  );
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
