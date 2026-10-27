/**
 * Mass Mailer Mobile — Google OAuth Service
 * Handles Authorization Code + PKCE flow with refresh tokens and multi-account inboxes.
 */

import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { GOOGLE_OAUTH } from '../config/constants';
import { storage } from './storage';

WebBrowser.maybeCompleteAuthSession();

export const oauthService = {
  /**
   * Start OAuth2 Web flow to add a Google Account to the sender pool.
   * Requests offline access and consent prompt to ensure refresh_token is returned.
   */
  async addGoogleAccount(customClientId = null, customClientSecret = null, loginHint = null, authMode = 'auto') {
    const settings = await storage.getSettings();
    const clientId = customClientId || settings.webClientId || GOOGLE_OAUTH.DEFAULT_CLIENT_ID;
    const clientSecret = customClientSecret !== null && customClientSecret !== undefined
      ? customClientSecret
      : (settings.webClientSecret || GOOGLE_OAUTH.DEFAULT_CLIENT_SECRET || '');

    if (!clientId) {
      throw new Error('Google OAuth Client ID is required. Please configure in Settings.');
    }

    // Determine effective redirect URI based on platform and environment
    const redirectUri = this.getRedirectUri(settings);

    // Generate PKCE code verifier and challenge
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const codeVerifier = Array.from(randomBytes, byte =>
      ('0' + (byte & 0xFF).toString(16)).slice(-2)
    ).join('');

    this._lastCodeVerifier = codeVerifier;
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );
    const codeChallenge = digest
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Clean email for login_hint
    const cleanEmail = (loginHint && typeof loginHint === 'string') ? loginHint.trim() : '';

    // Direct Google OAuth 2.0 authorization endpoint parameters
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: GOOGLE_OAUTH.SCOPES.join(' '),
      access_type: 'offline',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    if (cleanEmail) {
      // Focus directly on this account. Note: do NOT include select_account when login_hint is provided
      params.append('prompt', 'consent');
      params.append('login_hint', cleanEmail);
    } else {
      // Allow user to select from accounts or click 'Use another account'
      params.append('prompt', 'consent select_account');
    }

    const authUrl = `${GOOGLE_OAUTH.AUTH_ENDPOINT}?${params.toString()}`;

    // Determine return URI and start URL for WebBrowser
    const isWeb = typeof window !== 'undefined' && window.location && window.location.origin;
    let browserStartUrl = authUrl;
    let browserReturnUrl = redirectUri;

    if (!isWeb && redirectUri.includes('auth.expo.io')) {
      // When routing via AuthSession proxy, proxy forwards back to local native scheme
      let localReturnUrl = AuthSession.makeRedirectUri({ scheme: 'massmailerapp', path: 'redirect' });
      if (!localReturnUrl || localReturnUrl === 'massmailerapp://' || localReturnUrl === 'massmailerapp:/') {
        localReturnUrl = 'massmailerapp://redirect';
      }
      if (localReturnUrl.endsWith('://')) {
        localReturnUrl = `${localReturnUrl}redirect`;
      }
      browserReturnUrl = localReturnUrl;
      const proxyParams = new URLSearchParams({
        authUrl,
        returnUrl: localReturnUrl
      });
      browserStartUrl = `${redirectUri}/start?${proxyParams.toString()}`;
    }

    // Launch auth browser modal
    const result = await WebBrowser.openAuthSessionAsync(browserStartUrl, browserReturnUrl, {
      preferEphemeralSession: true,
      showInRecents: true,
    });

    if (result.type !== 'success' || !result.url) {
      throw new Error(result.type === 'cancel' ? 'Sign-in cancelled' : 'Authentication failed');
    }

    // Extract authorization code from callback URL
    let code = null;
    let errorDescription = null;
    try {
      const parsedUrl = new URL(result.url);
      code = parsedUrl.searchParams.get('code');
      errorDescription = parsedUrl.searchParams.get('error_description') || parsedUrl.searchParams.get('error');
      if (!code && parsedUrl.hash) {
        const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
        code = hashParams.get('code');
        errorDescription = errorDescription || hashParams.get('error_description') || hashParams.get('error');
      }
    } catch (_) {
      const match = result.url.match(/[?&]code=([^&#]+)/);
      if (match) code = decodeURIComponent(match[1]);
    }

    if (!code) {
      throw new Error(errorDescription || 'No authorization code returned from Google');
    }

    // Exchange authorization code for tokens
    const bodyParams = new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });

    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const tokenRes = await fetch(GOOGLE_OAUTH.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || err.error || `Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = parseInt(tokenData.expires_in || '3600', 10);

    // Fetch user Gmail profile
    const profileRes = await fetch(GOOGLE_OAUTH.PROFILE_ENDPOINT, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      throw new Error(`Profile fetch failed: ${profileRes.status}`);
    }

    const profile = await profileRes.json();
    const email = (profile.emailAddress || '').trim();
    const isWorkspace = !/@(gmail|googlemail)\.com$/i.test(email);

    const newAccount = {
      id: 'sender_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email,
      name: email.split('@')[0],
      title: '',
      signature: '',
      phone: '',
      isWorkspace,
      accountType: isWorkspace ? 'Workspace' : 'Personal',
      dailyLimit: isWorkspace ? settings.dailyLimitWorkspace : settings.dailyLimitPersonal,
      campaignLimit: null,
      token: accessToken,
      refreshToken,
      tokenExpiresAt: Date.now() + (expiresIn * 1000),
      clientId,
      clientSecret: clientSecret || null,
      attachment: null
    };

    return newAccount;
  },

  /**
   * Complete connection manually using the authorization code or redirect URL.
   * Useful when browser redirects don't automatically close in mobile sandbox.
   */
  async exchangeCodeForAccount(codeOrUrl) {
    if (!codeOrUrl || typeof codeOrUrl !== 'string') {
      throw new Error('Please enter the authorization code or full redirect URL.');
    }

    let code = codeOrUrl.trim();
    if (code.includes('code=')) {
      const match = code.match(/code=([^&]+)/);
      if (match) {
        code = decodeURIComponent(match[1]);
      }
    }

    if (!code) {
      throw new Error('Could not find authorization code in the provided input.');
    }

    const settings = await storage.getSettings();
    const clientId = settings.webClientId || GOOGLE_OAUTH.DEFAULT_CLIENT_ID;
    const clientSecret = settings.webClientSecret || GOOGLE_OAUTH.DEFAULT_CLIENT_SECRET || '';
    const redirectUri = this.getRedirectUri(settings);

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    if (this._lastCodeVerifier) {
      bodyParams.append('code_verifier', this._lastCodeVerifier);
    }
    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const tokenRes = await fetch(GOOGLE_OAUTH.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error_description || err.error || `Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = parseInt(tokenData.expires_in || '3600', 10);

    // Fetch user Gmail profile
    const profileRes = await fetch(GOOGLE_OAUTH.PROFILE_ENDPOINT, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      throw new Error(`Profile fetch failed: ${profileRes.status}`);
    }

    const profile = await profileRes.json();
    const email = (profile.emailAddress || '').trim();
    const isWorkspace = !/@(gmail|googlemail)\.com$/i.test(email);

    const newAccount = {
      id: 'sender_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email,
      name: email.split('@')[0],
      title: '',
      signature: '',
      phone: '',
      isWorkspace,
      accountType: isWorkspace ? 'Workspace' : 'Personal',
      dailyLimit: isWorkspace ? settings.dailyLimitWorkspace : settings.dailyLimitPersonal,
      campaignLimit: null,
      token: accessToken,
      refreshToken,
      tokenExpiresAt: Date.now() + (expiresIn * 1000),
      clientId,
      clientSecret: clientSecret || null,
      attachment: null
    };

    return newAccount;
  },

  /**
   * Refreshes access token for a sender if expired or expiring soon (within 5 minutes).
   * Seamless and zero-touch: campaigns and UI never need manual intervention.
   */
  async ensureValidToken(sender) {
    if (!sender) throw new Error('No sender account provided');

    const now = Date.now();
    // Valid for at least 5 more minutes?
    if (sender.token && sender.tokenExpiresAt && now < (sender.tokenExpiresAt - 300000)) {
      return sender.token;
    }

    if (!sender.refreshToken) {
      if (sender.token && now < sender.tokenExpiresAt) return sender.token;
      throw new Error(`Account ${sender.email} session expired and has no refresh token. Please re-authenticate.`);
    }

    const settings = await storage.getSettings();
    const clientId = sender.clientId || settings.webClientId || GOOGLE_OAUTH.DEFAULT_CLIENT_ID;
    const clientSecret = sender.clientSecret || settings.webClientSecret || GOOGLE_OAUTH.DEFAULT_CLIENT_SECRET || '';

    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: sender.refreshToken,
      grant_type: 'refresh_token'
    });
    if (clientSecret) {
      params.append('client_secret', clientSecret);
    }

    let lastError = null;
    // Retry up to 2 times for transient network dips
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(GOOGLE_OAUTH.TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error_description || err.error || `Token refresh failed: ${res.status}`);
        }

        const data = await res.json();
        sender.token = data.access_token;
        sender.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
        if (data.refresh_token) {
          sender.refreshToken = data.refresh_token;
        }

        // Update in stored senderPool
        const senders = await storage.getSenders();
        const idx = senders.findIndex(s => s.id === sender.id || s.email.toLowerCase() === sender.email.toLowerCase());
        if (idx !== -1) {
          senders[idx].token = sender.token;
          senders[idx].tokenExpiresAt = sender.tokenExpiresAt;
          if (data.refresh_token) senders[idx].refreshToken = data.refresh_token;
          await storage.saveSenders(senders);
        }

        return sender.token;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    throw lastError || new Error(`Token refresh failed for ${sender.email}`);
  },

  /**
   * Proactively auto-refreshes all accounts in background.
   * Eliminates any need for manual token refresh.
   */
  async autoRefreshAllAccounts() {
    try {
      const senders = await storage.getSenders();
      if (!Array.isArray(senders) || senders.length === 0) return [];

      const now = Date.now();
      let updated = false;

      for (const sender of senders) {
        // If has refresh token and expires within 10 minutes (or already expired)
        if (sender.refreshToken && (!sender.tokenExpiresAt || now > sender.tokenExpiresAt - 600000)) {
          try {
            await this.ensureValidToken(sender);
            updated = true;
          } catch (e) {
            console.log(`Quiet refresh for ${sender.email} skipped:`, e.message);
          }
        }
      }

      return updated ? await storage.getSenders() : senders;
    } catch (e) {
      console.log('autoRefreshAllAccounts error:', e.message);
      return [];
    }
  },

  /**
   * Helper to return the active redirect URI for display and configuration.
   */
  getRedirectUri(settings = {}) {
    if (settings.customRedirectUri && typeof settings.customRedirectUri === 'string' && settings.customRedirectUri.trim()) {
      return settings.customRedirectUri.trim();
    }
    // Web environment
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin;
    }
    // In Expo Go or development, return the approved HTTPS proxy URL
    return 'https://auth.expo.io/@anonymous/mass-mailer';
  }
};
