# 🚀 Mass Mailer Mobile (Android / React Native)

A high-performance, multi-account cold outreach and mass emailing mobile application built with **React Native** and **Expo**, engineered to run natively on Android with background execution, headless foreground services, Google Sheets 2-way sync, and intelligent round-robin sender rotation.

---

## 📑 Table of Contents

- [📱 Quick Start: Installing the Standalone APK](#-quick-start-installing-the-standalone-apk)
- [⚠️ Essential Android System Settings (Must Do Once)](#️-essential-android-system-settings-must-do-once)
- [✨ Core Capabilities & Highlights](#-core-capabilities--highlights)
- [🛠️ Complete 5-Tab Application Workflow](#️-complete-5-tab-application-workflow)
  - [Tab 1: 📬 Inboxes (Sender Accounts Pool)](#tab-1--inboxes-sender-accounts-pool)
  - [Tab 2: 📊 Leads (Data Sources & Live Sync)](#tab-2--leads-data-sources--live-sync)
  - [Tab 3: ✍️ Template (Personalized Messaging)](#tab-3-️-template-personalized-messaging)
  - [Tab 4: 🚀 Send (3-Stage Campaign Flow)](#tab-4--send-3-stage-campaign-flow)
  - [Tab 5: ⚙️ Settings (Safeguards & Preferences)](#tab-5-️-settings-safeguards--preferences)
- [🏢 Company Targeting & Limit Rules](#-company-targeting--limit-rules)
- [⏰ Precision Time Picker & Scheduling Engine](#-precision-time-picker--scheduling-engine)
- [🔄 Cross-Campaign Round-Robin Continuity](#-cross-campaign-round-robin-continuity)
- [📝 2-Way Google Sheets Live Sync & Write-Back](#-2-way-google-sheets-live-sync--write-back)
- [🔐 Google Cloud OAuth Setup Guide (Safe & Custom)](#-google-cloud-oauth-setup-guide-safe--custom)
- [💻 Developer Guide: Running from Source & Rebuilding](#-developer-guide-running-from-source--rebuilding)
- [📂 Project Architecture](#-project-architecture)
- [❓ Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)

---

## 📱 Quick Start: Installing the Standalone APK

The standalone Android APK is pre-compiled and ready for installation:

* **File Location:** [`MassMailer-v1.0.0.apk`](file:///d:/MassMailerApp/MassMailer-v1.0.0.apk)
* **Package Size:** ~71.5 MB (Self-contained with native Hermes engine, Android Foreground Services, and all native dependencies)
* **Android Support:** Android 9.0 (API Level 28) through Android 15+

### Installation Steps:
1. **Transfer the APK to your phone:**
   * Connect your phone to your PC via USB cable and copy `MassMailer-v1.0.0.apk` to your phone's **Download** folder, **OR**
   * Send the file to your phone via Google Drive, Telegram, or WhatsApp (as a Document).
2. **Install on Phone:**
   * Open your phone's **Files / File Manager** app, tap `MassMailer-v1.0.0.apk`, and tap **Install**.
   * If prompted with *"Install unknown apps"*, tap **Settings** and toggle **Allow from this source** to ON.
   * If Google Play Protect displays a prompt, tap **More details** ➔ **Install anyway**.

---

## ⚠️ Essential Android System Settings (Must Do Once)

Android power management aggressively sleeps background processes to conserve battery. To ensure your email campaigns run without interruption when the screen is locked, screen is off, or while you use other apps:

1. **Turn OFF Battery Optimization (Set to Unrestricted):**
   * Long-press the **Mass Mailer** icon on your home screen ➔ tap **App info (ⓘ)**.
   * Tap **Battery** (or **App battery usage**).
   * Select **Unrestricted** (or toggle off *Optimize battery usage*).
   * **Device-Specific Recommendations:**
     * **Samsung (One UI):** Device Care ➔ Battery ➔ Background usage limits ➔ Add Mass Mailer to **Never sleeping apps**.
     * **Xiaomi / Redmi / Poco (MIUI / HyperOS):** App info ➔ Battery saver ➔ Set to **No restrictions**. Enable **Autostart**.
     * **OnePlus / Realme / Oppo (OxygenOS / ColorOS):** App info ➔ Battery ➔ Enable **Allow background activity** and **Allow auto-launch**.
     * **Google Pixel / Motorola:** App info ➔ App battery usage ➔ Select **Unrestricted**.
2. **Grant Notification Permission:**
   * On first launch, tap **Allow** when prompted for notifications.
   * This enables the Android **Foreground Service** to display a persistent notification showing live dispatch progress and keep the dispatch engine active in the background.

---

## ✨ Core Capabilities & Highlights

* **Multi-Account Sender Pool:** Connect unlimited Gmail and Google Workspace accounts with persistent offline OAuth2 auto-renewal (no 1-hour session logouts).
* **Cross-Campaign Round-Robin Rotation:** Automatically rotates between sender accounts and remembers where previous campaigns left off so no account is overused.
* **Pre-Flight Campaign Simulation:** Evaluates company caps, duplicate emails, and targeting rules across your entire sheet before sending a single email.
* **Truthful Visual Previews:** Real-time preview letter cards clearly differentiate between leads that will send and leads that will be skipped with explicit skip reasons.
* **Custom Precision Time Picker:** Select any exact hour (1–12), minute (00–59), and period (AM/PM) with a live digital clock preview in a curved, centered dialog card.
* **Guaranteed Schedule Enforcement:** Validates active days and time windows before starting; automatically waits in the background if launched outside the scheduled window.
* **2-Way Google Sheets Synchronization:** Pulls live sheet edits with one tap and writes back `Status` (`Sent ✓`), `Sent At`, and `Sent From` in real time.
* **Per-Account Custom CV Attachments:** Assign specific PDF resumes to specific inboxes (e.g. sending different CVs from different sender identities).
* **Anti-Spam Safeguards:** Humanized randomized delays (Safe, Fast, Stealth, or Custom), per-company caps, duplicate email protection, and daily quota tracking.

---

## 🛠️ Complete 5-Tab Application Workflow

The app is organized into 5 dedicated tabs:

```
[ Inboxes 📬 ]   [ Leads 📊 ]   [ Template ✍️ ]   [ Send 🚀 ]   [ Settings ⚙️ ]
```

---

### Tab 1: 📬 Inboxes (Sender Accounts Pool)

Connect and manage the Google accounts you want to rotate through during dispatch.

1. **Add Google Account:**
   * Tap **`+ Add Account`**.
   * Complete the Google authentication window.
   * *If you see "Google hasn't verified this app":* Tap **Advanced** ➔ **Go to Mass Mailer (unsafe)** ➔ Check all permissions ➔ Tap **Continue**.
2. **Offline Refresh Token Persistence:**
   * Accounts show a green **`✓ Auto-Renew`** badge, meaning tokens refresh automatically in the background without needing to log in again.
3. **Inbox Customization (Expand any account card):**
   * **Sender Identity:** Set `{Sender.Name}`, `{Sender.Title}`, `{Sender.Phone}`, and `{Sender.Signature}` for personalized signatures.
   * **Custom CV / Resume:** Tap **Attach Custom CV (PDF)** to assign a tailored resume sent only when this account dispatches.
   * **Daily Sending Cap:** Set a maximum daily limit (e.g., 500 emails/day) to safeguard account reputation.
   * **Live Counters:** View `Today: X / Cap` and `Total Sent: Y` at a glance, with a button to reset today's counter.

---

### Tab 2: 📊 Leads (Data Sources & Live Sync)

Import your prospect list from Google Sheets or CSV files.

1. **Connect Google Sheet:**
   * Tap **`+ Add Leads`** ➔ Select **Google Sheets**.
   * Paste your Google Sheet URL (ensure the sheet is shared so your connected account has access).
   * Tap **Connect Sheet**.
2. **Import CSV File:**
   * Tap **`+ Add Leads`** ➔ Select **Local CSV** ➔ pick your `.csv` file (compatible with Apollo, LinkedIn scrapers, and standard CSV exports).
3. **Live Syncing (`🔄 Sync Doc`):**
   * If you edit cells or add new rows to your Google Sheet online, tap the **`🔄 Sync`** button on the sheet card (or tap **`🔄 Sync All`** in the header).
   * The app fetches the latest rows immediately via Google Sheets API.
4. **👁️ Lead Inspector:**
   * Tap **Preview** on any data source card to browse rows, search leads by keyword, filter by Sent / Unsent / Failed, and inspect column values.

---

### Tab 3: ✍️ Template (Personalized Messaging)

Compose your outreach email copy with dynamic placeholder substitution.

1. **Subject Line:** e.g. `Quick question regarding {Company} and engineering`
2. **Email Body:** Supports clean HTML formatting:
   ```html
   <p>Hi {First Name},</p>
   <p>I came across your profile and noticed the great work your team is doing at {Company}.</p>
   <p>Would you be open to a brief 10-minute chat sometime this week?</p>
   <p>Best regards,<br>
   <strong>{Sender.Name}</strong><br>
   {Sender.Title}</p>
   ```
3. **Dynamic Tokens:**
   * **Lead tokens:** `{Email}`, `{First Name}`, `{Company}`, `{Title}`, or any column header name in your sheet.
   * **Sender tokens:** `{Sender.Name}`, `{Sender.Title}`, `{Sender.Phone}`, `{Sender.Signature}`, `{Sender.Email}`.
4. **Master Resume:** Attach a default PDF resume used for any sender account that does not have an account-specific CV assigned.
5. **Template Presets:** Tap **Save Preset** to store templates for future campaigns.

---

### Tab 4: 🚀 Send (3-Stage Campaign Flow)

#### Stage 1: Campaign Setup (Config)
* **📋 Active Lead Source Card:** Displays total leads, already sent, and ready count, with a **`🔄 Sync Doc`** button.
* **1. Sending Mode:**
  * **⚡ Instant Real-Time:** Continuous dispatch with randomized anti-spam delays (e.g. 10–20s).
  * **📅 Scheduled Window:** Dispatches in cycles (e.g. 2 emails every 5 mins) during selected active days and hours.
* **2. Anti-Spam Delays:** Quick presets (`Safe: 10–20s`, `Fast: 5–8s`, `Stealth: 30–60s`) or custom delay ranges.
* **3. Run Batch Send Limit:** Optional limit to pause after sending 5, 10, 25, 50, or leave blank to send all.
* **4. Company Targeting & Limits:**
  * **All Companies:** Send to all detected companies, with optional universal cap or individual overrides.
  * **Specific Companies Only:** Select exactly which companies to target; all unselected companies are excluded.
  * *See [Company Targeting & Limit Rules](#-company-targeting--limit-rules) for detailed semantics.*
* **5. Per-Account Campaign Limits:** Set max emails individual inboxes may send during this campaign run (leave blank for unlimited).
* Tap **`👁️ Preview & Send →`** (the app automatically syncs the Google Sheet in the background).

#### Stage 2: Full Campaign Simulation & Preview
* **📊 Campaign Summary Grid:** Live counters for Total in Sheet, Already Sent, To Send, and Active Inboxes.
* **🏢 Company Cap Breakdown:** Clear table showing `Will Send / Total (Cap: X)` for every company.
* **👥 Senders Pool Allocation:** Shows exact email allocation per account via round-robin rotation.
* **🔄 Continuity Notice:** Displays which sender the previous campaign ended on and which sender begins this run.
* **👁️ Full Letter Previews:** Review the personalized emails:
  * **Ready to Send:** Displays TO, COMPANY, FROM, rotation badge (`Lead #N • Sender X/Y`), subject, body, and attachment.
  * **Skipped Leads:** Prominently flagged with an amber badge (`⏭️ SKIPPED • Will Not Send`) and the explicit skip reason (e.g. `Company limit reached for "Y" (Cap: 1 max)` or `Company "Z" not selected`).
* Tap **`🚀 Start Campaign`**.

#### Stage 3: Live Campaign Dashboard
* **Progress Bar:** Real-time percentage, current row index, and active sender email.
* **Dispatch Metrics:**
  * `✓ SENT` (Successfully delivered via Gmail API)
  * `✗ FAILED` (Delivery errors or invalid emails)
  * `⏭ SKIPPED` (Duplicates / Company caps reached / Unselected companies)
* **📬 Inboxes Dispatch Activity:** Live counters showing sent in this campaign, sent today against daily cap, and lifetime total.
* **Control Buttons:** `⏸ Pause`, `▶ Resume`, `⏹ Stop`, and `+ New Campaign`.
* **Engine Terminal Output:** Real-time event log with auto-scroll.

---

### Tab 5: ⚙️ Settings (Safeguards & Preferences)

* **Universal Company Cap:** Default maximum emails per company across all campaigns (leave blank for unlimited).
* **Duplicate Protection:** Automatically skips any email address already sent in previous campaigns or duplicated in the sheet.
* **Dark / Light Theme:** Toggle between dark mode and light mode.
* **Custom Google OAuth Credentials:** Option to provide your own Google Cloud Client ID and Client Secret.

---

## 🏢 Company Targeting & Limit Rules

The app provides two distinct targeting modes with clear limit semantics:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TARGETING MODE                                                         │
│                                                                        │
│ ○ All Companies         Target all companies in the sheet              │
│ ● Specific Companies    Target ONLY chosen companies (others excluded) │
└────────────────────────────────────────────────────────────────────────┘
```

### Limit Semantics (Blank vs. Number):
* **Blank / Empty Field = Unlimited (∞):** If you leave the limit input blank, no limit is applied. The app will send to all available leads from that company.
* **Number Entered (e.g., `1`, `3`) = Strict Cap:** The app will send at most that exact number of emails to that company. All subsequent leads from that company are automatically skipped.

### Practical Example:
* **Goal:** Send to any number of people from **Company X**, only **1 person** from **Company Y**, and **no one else**.
* **Configuration:**
  1. Select **Specific Companies Only**.
  2. Select **Company X** and **Company Y** using the picker dialog.
  3. In the limits table:
     * Leave **Company X** blank ➔ shows `No limit (∞ unlimited)`.
     * Set **Company Y** to `1` ➔ shows `Max 1 emails`.
* **Result in Preview & Dispatch:**
  * All leads from **Company X** will send.
  * Exactly **1 lead** from **Company Y** will send; leads #2, #3, etc. from Company Y are marked as `⏭️ SKIPPED: Company limit reached for "Y" (Cap: 1 max)`.
  * All other companies in the sheet are marked as `⏭️ SKIPPED: Company "..." not selected`.
  * The `To Send` counter and sender allocation count only the leads that will actually be sent.

---

## ⏰ Precision Time Picker & Scheduling Engine

The app includes a custom time picker dialog designed for exact schedule control without arbitrary fixed slots:

```
┌──────────────────────────────────────────────────────────┐
│ 🕒 Set Start Time (From)                               ✕ │
│ Choose any hour, minute & period                         │
│                                                          │
│     ┌──────────────────────────────────────────────┐     │
│     │          09  :  15    [ AM ]                 │     │
│     └──────────────────────────────────────────────┘     │
│                                                          │
│   MINUTES:  [:00]  [:15]  [:30]  [:45]                   │
│                                                          │
│   HOUR (1–12)         MIN (00–59)          PERIOD        │
│   ┌─────────────┐     ┌─────────────┐     ┌────────────┐ │
│   │     08      │     │     14      │     │   [ AM ]   │ │
│   │   ▶ 09 ◀    │     │   ▶ 15 ◀    │     │            │ │
│   │     10      │     │     16      │     │     PM     │ │
│   └─────────────┘     └─────────────┘     └────────────┘ │
│                                                          │
│   [  Cancel  ]              [  Confirm 09:15 AM ✓  ]     │
└──────────────────────────────────────────────────────────┘
```

### Key Scheduling Capabilities:
1. **Full Independence:** Select any hour from `01` to `12`, any minute from `00` to `59`, and `AM` or `PM`.
2. **Quick Minute Shortcuts:** Tap `:00`, `:15`, `:30`, or `:45` for fast one-tap selection, or scroll through all 60 minutes.
3. **Live Digital Clock:** Updates in real time as you tap options.
4. **Guaranteed Schedule Waiting:**
   * When you launch a scheduled campaign, the dispatch engine evaluates `isCurrentTimeInWindow` **before** dispatching email #1.
   * If the current local time or day is outside the active window, the app **does not send**.
   * It enters a low-power background wait loop, updates the persistent notification (`🌙 Scheduled: waiting for 09:00 AM`), and begins dispatching the moment the window opens.

---

## 🔄 Cross-Campaign Round-Robin Continuity

When managing multiple sender inboxes, rotating evenly is essential for domain health:

* **State Tracking:** The app records the index of the account that sent the last email of any campaign (`lastSenderIndex`).
* **Seamless Resumption:** When starting your next campaign, dispatch begins with the **next inbox in line**:
  * *Example:* If Campaign 1 had 3 inboxes and finished on Inbox #2 (`user2@gmail.com`), Campaign 2 will start immediately with Inbox #3 (`user3@gmail.com`), ensuring perfectly balanced utilization over time.
* **Preview Transparency:** The Preview screen displays an explicit continuity card explaining which account completed the previous run and which account will begin the new run.

---

## 📝 2-Way Google Sheets Live Sync & Write-Back

### Syncing Down (Sheets ➔ App):
* Tap **`🔄 Sync Doc`** on the lead card in the Send screen or Leads tab.
* The app queries the Google Sheets API directly and refreshes the in-memory lead queue with any new rows or cell edits made in your browser or spreadsheet app.

### Writing Back (App ➔ Sheets):
When an email is successfully sent, the engine updates your Google Sheet online in real time:
1. The app verifies that three tracking columns exist in **Row 1** of your connected sheet (and adds them if they do not exist):
   * **`Status`** ➔ Written as `Sent ✓`
   * **`Sent At`** ➔ Written with the local timestamp (e.g., `10/27/2026, 7:30:15 PM`)
   * **`Sent From`** ➔ Written with the sender email address that dispatched the email
2. Column mapping is dynamic: your sheet columns can be in any order, and existing columns are never overwritten.

---

## 🔐 Google Cloud OAuth Setup Guide (Safe & Custom)

The app comes pre-configured with default credentials, but you can also connect using your own Google Cloud project credentials for full independence.

### Step-by-Step Setup:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `My Mass Mailer`).
3. Enable the required APIs:
   * Navigate to **APIs & Services** ➔ **Library**.
   * Search for and enable **Gmail API**.
   * Search for and enable **Google Sheets API**.
4. Configure the OAuth Consent Screen:
   * Go to **APIs & Services** ➔ **OAuth consent screen**.
   * Select **External** (or **Internal** if using a Google Workspace organization).
   * Fill in the App Name (e.g. `Mass Mailer Mobile`) and your email address.
   * Add the following scopes:
     * `https://www.googleapis.com/auth/gmail.send`
     * `https://www.googleapis.com/auth/gmail.compose`
     * `https://www.googleapis.com/auth/gmail.modify`
     * `https://www.googleapis.com/auth/spreadsheets`
     * `https://www.googleapis.com/auth/userinfo.email`
     * `https://www.googleapis.com/auth/userinfo.profile`
   * Under **Test users**, add the Gmail addresses you plan to connect.
5. Create OAuth 2.0 Client ID:
   * Go to **APIs & Services** ➔ **Credentials** ➔ **Create Credentials** ➔ **OAuth client ID**.
   * Application type: **Web application**.
   * Name: `Mass Mailer Client`.
   * Under **Authorized redirect URIs**, add:
     * `https://auth.expo.io/@<YOUR_EXPO_USERNAME>/massmailerapp` (if using Expo Go)
     * `http://127.0.0.1`
     * `massmailerapp://redirect`
   * Tap **Create**.
6. Enter Credentials in the App:
   * In the app, navigate to **Settings (⚙️)** ➔ **Google OAuth Credentials**.
   * Paste your **Client ID** and **Client Secret**.
   * Tap **Save Settings**.
   * *(Optional for developers)*: You can also copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_CLIENT_SECRET` to automatically pre-populate your credentials without committing them to version control.

---

## 💻 Developer Guide: Running from Source & Rebuilding

### Prerequisites
* **Node.js:** v20.x or higher
* **Java:** OpenJDK 17 or 21 (`JAVA_HOME` environment variable configured)
* **Android SDK:** Command-line tools and API Level 34+ (`ANDROID_HOME` configured)

### Running in Development:
```bash
cd D:\MassMailerApp
npm install
npm start
```
Scan the displayed QR code using the **Expo Go** app on your Android device.

### Rebuilding the Standalone Release APK:
To compile a fresh standalone APK locally:
```bash
cd D:\MassMailerApp

# 1. Ensure ANDROID_HOME is set (PowerShell example)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

# 2. Compile release APK with Gradle
cd android
.\gradlew.bat assembleRelease
```
The compiled APK will be located at:
`d:\MassMailerApp\android\app\build\outputs\apk\release\app-release.apk`

Copy it to the project root:
```powershell
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" -Destination "MassMailer-v1.0.0.apk" -Force
```

---

## 📂 Project Architecture

```
d:\MassMailerApp\
├── App.js                         # Root application entry & 5-tab custom navigation
├── app.json                       # Android package manifest, schemes & permissions
├── eas.json                       # EAS build profile definitions
├── package.json                   # Dependencies, libraries, and script targets
├── MassMailer-v1.0.0.apk          # Pre-built standalone release APK
├── android/                       # Native Android project (Gradle, AndroidManifest, Notifee service)
└── src/
    ├── config/
    │   └── constants.js           # OAuth endpoints, scopes, default settings
    ├── context/
    │   └── ThemeContext.js        # Dark/light theme provider & color tokens
    ├── services/
    │   ├── oauth.js               # PKCE OAuth2 authentication & offline refresh flow
    │   ├── gmail.js               # Gmail REST API message composer & dispatcher
    │   ├── sheets.js              # Google Sheets API client & CSV parser
    │   ├── mailerEngine.js        # State machine, schedule window check & dispatch engine
    │   ├── storage.js             # Persistent AsyncStorage lead, account & state store
    │   └── foregroundService.js   # Android Foreground Service lifecycle manager
    ├── utils/
    │   ├── mailerUtils.js         # Placeholder parser, time calculators, MIME encoder
    │   └── fileUtils.js           # Document picker & Base64 attachment reader
    ├── components/
    │   ├── StatCard.js            # High-contrast metric cards (Sent, Failed, Skipped)
    │   ├── SenderCard.js          # Inbox card with today/lifetime counters & CV override
    │   ├── SourceCard.js          # Data source card with live 🔄 Sync Doc button
    │   └── LogView.js             # Terminal activity log with auto-scroll
    └── screens/
        ├── AccountsScreen.js      # Inboxes management & Google login
        ├── DataScreen.js          # Google Sheets & CSV leads with Lead Inspector
        ├── TemplateScreen.js      # Rich email template composer & presets
        ├── SendScreen.js          # 3-Stage Campaign Flow (Config ➔ Preview ➔ Dashboard)
        └── SettingsScreen.js      # Evergreen safeguards & credentials
```

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Why did my scheduled campaign wait instead of sending immediately?
**A:** This is by design! When you select **Scheduled Window**, the app evaluates your active days (e.g. Mon–Fri) and active hours (e.g. 09:00 AM – 05:00 PM). If you start the campaign outside this window, the app waits in the background and will automatically start dispatching as soon as the scheduled window opens.

#### Q: Why are some leads marked as Skipped in the Preview screen?
**A:** The preview screen simulates the exact dispatch rules before sending:
* If a company has reached its cap (e.g. limit of 1 email for Company Y), all subsequent leads from Company Y are marked `⏭️ SKIPPED`.
* If you chose **Specific Companies Only**, any leads from unselected companies are marked `⏭️ SKIPPED`.
* If a lead has already been emailed in a previous run, it is marked `⏭️ SKIPPED`.
* If an email is duplicated in your sheet, duplicates are marked `⏭️ SKIPPED`.

#### Q: How does the app ensure sender accounts are rotated fairly?
**A:** The app uses continuous round-robin scheduling. It tracks which sender account sent the last email of a campaign and automatically starts the next campaign with the subsequent account in your pool.

#### Q: What happens if an account reaches its daily Gmail limit?
**A:** The engine automatically detects when an account has reached its daily limit or campaign limit, skips that account, and continues rotating through your remaining available accounts. If all accounts reach their limits, the campaign automatically pauses.

#### Q: Google displays "Google hasn't verified this app" during login. Is this safe?
**A:** Yes. This warning appears because your Google Cloud project is in personal/developer mode and hasn't gone through Google's commercial verification process. Tap **Advanced** ➔ **Go to Mass Mailer (unsafe)** to proceed safely.
