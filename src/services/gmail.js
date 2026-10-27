/**
 * Mass Mailer Mobile — Gmail Service
 * Handles sending emails and creating drafts via Gmail REST API v1.
 */

import { buildMimeMessage, base64UrlEncode } from '../utils/mailerUtils';
import { oauthService } from './oauth';

export const gmailService = {
  /**
   * Send personalized email via Gmail REST API with auto-token refresh & 401 recovery
   */
  async sendEmail(sender, to, subject, body, attachment = null) {
    let token = await oauthService.ensureValidToken(sender);
    const mime = buildMimeMessage(to, subject, body, attachment);
    const raw = base64UrlEncode(mime);

    let res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      }
    );

    // Auto-retry once on 401
    if (res.status === 401 && sender.refreshToken) {
      sender.tokenExpiresAt = 0; // force refresh
      token = await oauthService.ensureValidToken(sender);
      res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw })
        }
      );
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail send failed: ${res.status}`);
    }

    return res.json();
  },

  /**
   * Create draft in Gmail with auto-token refresh & 401 recovery
   */
  async createDraft(sender, to, subject, body, attachment = null) {
    let token = await oauthService.ensureValidToken(sender);
    const mime = buildMimeMessage(to, subject, body, attachment);
    const raw = base64UrlEncode(mime);

    let res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: { raw } })
      }
    );

    if (res.status === 401 && sender.refreshToken) {
      sender.tokenExpiresAt = 0;
      token = await oauthService.ensureValidToken(sender);
      res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: { raw } })
        }
      );
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail draft creation failed: ${res.status}`);
    }

    return res.json();
  }
};
