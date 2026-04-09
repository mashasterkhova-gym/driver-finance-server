# Driver Finance Server

Node.js/Express server that receives form submissions from the Lovable app and appends rows to a Google Sheet.

---

## 1. Set Up Google Cloud Service Account

### a. Create a project and enable Sheets API
1. Go to https://console.cloud.google.com
2. Click **Select a project** → **New Project** → give it a name → **Create**
3. In the left menu go to **APIs & Services → Library**
4. Search for **Google Sheets API** → click it → **Enable**

### b. Create a Service Account
1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service account**
3. Fill in a name (e.g. `sheets-writer`) → **Create and Continue** → **Done**
4. Click the service account email you just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON** → **Create**
6. A `.json` file downloads — keep it safe, you'll copy values from it next

### c. Share your Google Sheet with the service account
1. Open (or create) the Google Sheet you want data saved to
2. Click **Share** (top right)
3. Paste the service account email (looks like `sheets-writer@your-project.iam.gserviceaccount.com`) → give it **Editor** access → **Send**
4. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit`

### d. Add a header row (optional but recommended)
In row 1 of Sheet1, add these headers:

| timestamp | goal | goal_amount | vehicle_type | hours_per_day | days_per_week | savings_intensity_pct | estimated_monthly_profit | daily_savings | weekly_savings | months_to_goal |
|-----------|------|-------------|--------------|---------------|---------------|-----------------------|--------------------------|---------------|----------------|----------------|

---

## 2. Deploy on Render (Free Tier)

### a. Push this folder to GitHub
1. Create a new GitHub repo (e.g. `driver-finance-server`)
2. Push the contents of this folder to it:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/driver-finance-server.git
   git push -u origin main
   ```

### b. Create a Web Service on Render
1. Go to https://render.com and sign in
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Click **Create Web Service**

### c. Set Environment Variables on Render
Go to your service → **Environment** tab → add these three variables:

| Key | Value |
|-----|-------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The `client_email` value from your downloaded JSON key file |
| `GOOGLE_PRIVATE_KEY` | The `private_key` value from your downloaded JSON key file (paste the entire value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`) |
| `SPREADSHEET_ID` | The ID you copied from the Google Sheet URL |

> **Important:** Paste `GOOGLE_PRIVATE_KEY` exactly as it appears in the JSON file (with literal `\n` characters). The server replaces them with real newlines automatically.

After saving, Render will redeploy. Your server URL will be something like:
`https://driver-finance-server.onrender.com`

### d. Test it
```bash
curl https://driver-finance-server.onrender.com/health
# should return: {"status":"ok"}
```

---

## 3. Lovable Frontend — Fetch Code Snippet

Add this to the "Complete the task" button click handler in your Lovable app.
Replace `YOUR_RENDER_URL` with your actual Render service URL.

```javascript
const SERVER_URL = 'https://driver-finance-server.onrender.com';

async function handleSubmit() {
  // Gather your calculated values here
  const payload = {
    goal: selectedGoal,                     // e.g. "Emergency Fund"
    goal_amount: goalAmount,                // number, PKR
    vehicle_type: vehicleType,              // "Car" / "Rickshaw" / "Motorcycle"
    hours_per_day: hoursPerDay,             // number
    days_per_week: daysPerWeek,             // number
    savings_intensity_pct: savingsIntensityPct, // number
    estimated_monthly_profit: estimatedMonthlyProfit, // number, PKR
    daily_savings: dailySavings,            // number, PKR
    weekly_savings: weeklySavings,          // number, PKR
    months_to_goal: monthsToGoal,           // number or "Less than a month"
  };

  // Show loading state
  setIsLoading(true);
  setError(null);

  try {
    const response = await fetch(`${SERVER_URL}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Submission failed');
    }

    // Success — navigate to results or show confirmation
    console.log('Saved to Google Sheets successfully');
  } catch (err) {
    console.error('Submit error:', err);
    setError('Could not save your plan. Please try again.');
  } finally {
    setIsLoading(false);
  }
}
```

In your JSX button:
```jsx
<button onClick={handleSubmit} disabled={isLoading}>
  {isLoading ? 'Saving...' : 'Complete the task'}
</button>

{error && <p style={{ color: 'red' }}>{error}</p>}
```

---

## Note on Render Free Tier

Free Render services spin down after 15 minutes of inactivity and take ~30 seconds to wake up on the next request. The first submission after idle may be slow — this is normal. Consider a free uptime monitor (e.g. UptimeRobot) pinging `/health` every 10 minutes if you need it always-on.
