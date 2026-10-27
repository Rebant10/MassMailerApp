/**
 * Mass Mailer Mobile — Native Android Foreground Service
 * Keeps campaign execution alive even if phone is locked, app is minimized, or in background.
 * Uses Android 14+ compatible dataSync foreground service type.
 * Renders persistent notification with live progress and action buttons (Pause / Resume / Stop).
 * Includes safe sandbox fallback for Expo Go preview.
 */

let notifee = null;
let AndroidImportance = { HIGH: 4 };
let AndroidVisibility = { PUBLIC: 1 };
let EventType = { ACTION_PRESS: 1 };
let AndroidForegroundServiceType = { FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1 };

try {
  const mod = require('@notifee/react-native');
  notifee = mod.default || mod;
  if (mod.AndroidImportance) AndroidImportance = mod.AndroidImportance;
  if (mod.AndroidVisibility) AndroidVisibility = mod.AndroidVisibility;
  if (mod.EventType) EventType = mod.EventType;
  if (mod.AndroidForegroundServiceType) AndroidForegroundServiceType = mod.AndroidForegroundServiceType;
} catch (err) {
  console.log('[ForegroundService] Notifee native module skipped:', err.message);
}

const CHANNEL_ID = 'mass_mailer_campaign_channel';
const NOTIFICATION_ID = 'mass_mailer_campaign_active';

let engineInstance = null;
let serviceResolver = null;

// Register headless foreground service task runner with Notifee
if (notifee && typeof notifee.registerForegroundService === 'function') {
  try {
    notifee.registerForegroundService((notification) => {
      return new Promise((resolve) => {
        serviceResolver = resolve;
      });
    });
  } catch (err) {
    console.warn('[ForegroundService] registerForegroundService error:', err.message);
  }
}

export const foregroundService = {
  isInitialized: false,

  registerEngine(engine) {
    engineInstance = engine;
    this.setupListeners();
  },

  async requestPermission() {
    if (!notifee || typeof notifee.requestPermission !== 'function') return true;
    try {
      const settings = await notifee.requestPermission();
      return settings.authorizationStatus >= 1;
    } catch (err) {
      console.warn('[ForegroundService] requestPermission error:', err.message);
      return false;
    }
  },

  async isBatteryOptimizationEnabled() {
    if (!notifee || typeof notifee.isBatteryOptimizationEnabled !== 'function') return false;
    try {
      return await notifee.isBatteryOptimizationEnabled();
    } catch (e) {
      return false;
    }
  },

  async openBatteryOptimizationSettings() {
    if (!notifee || typeof notifee.openBatteryOptimizationSettings !== 'function') return;
    try {
      await notifee.openBatteryOptimizationSettings();
    } catch (e) {}
  },

  async ensureChannel() {
    if (!notifee) return;
    try {
      await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Mass Mailer Campaign Service',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
      });
      this.isInitialized = true;
    } catch (err) {
      console.warn('[ForegroundService] Channel init skipped:', err.message);
    }
  },

  setupListeners() {
    if (!notifee) return;
    try {
      notifee.onForegroundEvent(({ type, detail }) => {
        this.handleAction(type, detail);
      });

      notifee.onBackgroundEvent(async ({ type, detail }) => {
        this.handleAction(type, detail);
      });
    } catch (e) {
      // Quiet fallback
    }
  },

  handleAction(type, detail) {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail?.pressAction?.id;
      if (actionId === 'pause_action') {
        engineInstance?.pause();
      } else if (actionId === 'resume_action') {
        engineInstance?.resume();
      } else if (actionId === 'stop_action') {
        engineInstance?.stop();
      }
    }
  },

  async startForegroundNotification({
    currentIndex = 0,
    totalRows = 0,
    currentSenderEmail = '',
    progressPercent = 0,
    statusText = '',
  }) {
    if (!notifee) return;
    try {
      await this.requestPermission();
      await this.ensureChannel();

      const bodyText = statusText
        ? statusText
        : `Progress: ${progressPercent}% (${currentIndex}/${totalRows})${
            currentSenderEmail ? ` • Sender: ${currentSenderEmail}` : ''
          }`;

      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title: '🚀 Mass Mailer • Campaign Active',
        body: bodyText,
        android: {
          channelId: CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: [
            AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC || 1,
          ],
          ongoing: true,
          autoCancel: false,
          color: '#6C5CE7',
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: '⏸ Pause',
              pressAction: { id: 'pause_action' },
            },
            {
              title: '⏹ Stop',
              pressAction: { id: 'stop_action' },
            },
          ],
        },
      });
    } catch (err) {
      console.warn('[ForegroundService] Notification start skipped:', err.message);
    }
  },

  async updateProgress({
    currentIndex = 0,
    totalRows = 0,
    currentSenderEmail = '',
    progressPercent = 0,
    statusText = '',
    isPaused = false,
  }) {
    if (!notifee) return;
    try {
      const title = isPaused
        ? '⏸ Mass Mailer • Campaign Paused'
        : '🚀 Mass Mailer • Campaign Active';

      const actions = isPaused
        ? [
            { title: '▶ Resume', pressAction: { id: 'resume_action' } },
            { title: '⏹ Stop', pressAction: { id: 'stop_action' } },
          ]
        : [
            { title: '⏸ Pause', pressAction: { id: 'pause_action' } },
            { title: '⏹ Stop', pressAction: { id: 'stop_action' } },
          ];

      const bodyText = statusText
        ? statusText
        : `Progress: ${progressPercent}% (${currentIndex}/${totalRows})${
            currentSenderEmail ? ` • Sender: ${currentSenderEmail}` : ''
          }`;

      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title,
        body: bodyText,
        android: {
          channelId: CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: [
            AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC || 1,
          ],
          ongoing: true,
          autoCancel: false,
          color: isPaused ? '#FFAA00' : '#6C5CE7',
          pressAction: { id: 'default' },
          actions,
        },
      });
    } catch (err) {
      // Quiet fail if not supported
    }
  },

  async stopForegroundNotification(completionSummary = null) {
    if (!notifee) return;
    try {
      if (serviceResolver) {
        serviceResolver();
        serviceResolver = null;
      }
      if (typeof notifee.stopForegroundService === 'function') {
        await notifee.stopForegroundService();
      }
      await notifee.cancelNotification(NOTIFICATION_ID);

      if (completionSummary) {
        await notifee.displayNotification({
          title: '🏁 Mass Mailer • Campaign Complete',
          body: `Sent: ${completionSummary.sentCount} | Failed: ${completionSummary.failedCount} | Skipped: ${completionSummary.skippedCount}`,
          android: {
            channelId: CHANNEL_ID,
            autoCancel: true,
            color: '#00D68F',
          },
        });
      }
    } catch (err) {
      // Quiet fail
    }
  },
};
