/**
 * Mass Mailer Mobile — Constants & Configuration
 */

export const GOOGLE_OAUTH = {
  SCOPES: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  AUTH_ENDPOINT: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_ENDPOINT: 'https://oauth2.googleapis.com/token',
  PROFILE_ENDPOINT: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  DEFAULT_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  DEFAULT_CLIENT_SECRET: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET || ''
};

export const STORAGE_KEYS = {
  SENDER_POOL: 'MM_SENDER_POOL',
  ACTIVE_SHEET: 'MM_ACTIVE_SHEET',       // Legacy — kept for migration
  DATA_SOURCES: 'MM_DATA_SOURCES',        // Array of source objects
  COMBINED_LEADS: 'MM_COMBINED_LEADS',    // Merged lead pool
  TEMPLATES: 'MM_TEMPLATES',
  ACTIVE_TEMPLATE: 'MM_ACTIVE_TEMPLATE',
  SETTINGS: 'MM_SETTINGS',
  CAMPAIGN_HISTORY: 'MM_CAMPAIGN_HISTORY',
  DAILY_SENT_STATS: 'MM_DAILY_SENT_STATS',
  SCHEDULE_CONFIG: 'MM_SCHEDULE_CONFIG',
  THEME_PREFERENCE: 'MM_THEME_PREFERENCE'
};

export const DEFAULT_SETTINGS = {
  deliveryMode: 'realtime', // 'realtime' | 'scheduled'
  delayMin: 10, // seconds
  delayMax: 20, // seconds
  pacingPreset: 'safe',
  sendLimit: '',
  batchSize: 5,
  dailyLimitPersonal: 500,
  dailyLimitWorkspace: 2000,
  dailyLimitCloudPersonal: 100,
  dailyLimitCloudWorkspace: 1500,
  companyTargetMode: 'all', // 'all' = All companies | 'specific' = Selected companies only
  selectedCompanies: [],    // Array of targeted company names
  companyLimitAll: null,    // null = unlimited
  companyLimits: {},        // { "Google": 2, "Amazon": 1 }
  companyLimitRows: [],     // Stored company limit items
  duplicateProtection: true,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  webClientSecret: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET || ''
};

export const DEFAULT_TEMPLATE = {
  id: 'default_template',
  name: 'Cold Outreach Standard',
  subject: 'Quick question regarding {Company} and engineering',
  body: `<p>Hi {First Name},</p>
<p>I hope you're having a productive week.</p>
<p>I came across your profile and noticed the great work your team is doing at {Company}. I wanted to reach out because my background in full-stack software development aligns closely with your engineering initiatives.</p>
<p>Would you be open to a brief 10-minute chat sometime this week?</p>
<p>Best regards,<br>
<strong>{Sender.Name}</strong><br>
{Sender.Title}<br>
{Sender.Phone}</p>`
};

export const DEFAULT_SCHEDULE = {
  enabled: false,
  activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime: '09:00 AM',
  endTime: '05:00 PM',
  batchSize: 2,       // Emails per cycle (Extension default: 2)
  delaySeconds: 5,    // Pause between emails in batch (Extension default: 5s)
  batchInterval: 5,   // Minutes between batch cycles (Extension default: 5 min)
  dailyLimit: 40,     // Max emails per 24 hours (Extension default: 40)
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
};
