/**
 * Mass Mailer Mobile — Core Utilities
 * Ported and enhanced from Mass Mailer extension
 */

/**
 * Replace placeholders like {First Name}, {Company}, {Sender.Name}, etc.
 * with values from the current row and sender profile.
 */
export function parsePlaceholders(text, row = {}, sender = null) {
  if (!text) return '';

  return text.replace(/\{([^}]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim();

    // Sender profile fields: {Sender.Name}, {Sender.Title}, etc.
    if (/^Sender\./i.test(key)) {
      const field = key.replace(/^Sender\./i, '').toLowerCase();
      if (!sender) return '';
      switch (field) {
        case 'name':      return sender.name || '';
        case 'title':     return sender.title || '';
        case 'phone':     return sender.phone || '';
        case 'signature': return sender.signature || '';
        case 'email':     return sender.email || '';
        default:          return '';
      }
    }

    // Direct row match
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]);
    }

    // Case-insensitive fallback across sheet row keys
    const lower = key.toLowerCase();
    const foundKey = Object.keys(row).find(k => k.toLowerCase() === lower);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]);
    }

    // Common aliases
    if (lower === 'first name' || lower === 'firstname' || lower === 'fname') {
      const nameKey = Object.keys(row).find(k => /^(full\s*)?name$/i.test(k));
      if (nameKey && row[nameKey]) {
        return String(row[nameKey]).trim().split(/\s+/)[0];
      }
    }

    return match; // Keep unchanged if placeholder is not found
  });
}

/**
 * Base64-URL encode UTF-8 string for Gmail API
 */
export function base64UrlEncode(str) {
  // Handles multi-byte UTF-8 characters cleanly
  const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );

  let binary = '';
  if (typeof btoa === 'function') {
    binary = btoa(utf8Bytes);
  } else {
    binary = Buffer.from(utf8Bytes, 'binary').toString('base64');
  }

  return binary
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build RFC 2822 / MIME format email string with optional file attachment
 */
export function buildMimeMessage(to, subject, bodyHtmlOrText, attachment = null) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const cleanTo = String(to || '').trim();
  const cleanSubject = String(subject || '').trim();

  // If body has HTML tags, wrap as HTML, else preserve newlines
  const isHtml = /<[a-z][\s\S]*>/i.test(bodyHtmlOrText);
  const formattedBody = isHtml
    ? bodyHtmlOrText
    : bodyHtmlOrText.replace(/\n/g, '<br>\n');

  if (!attachment || !attachment.base64Data) {
    // Single-part HTML email
    return [
      `To: ${cleanTo}`,
      `Subject: =?UTF-8?B?${typeof btoa === 'function' ? btoa(encodeURIComponent(cleanSubject).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))) : Buffer.from(cleanSubject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      formattedBody
    ].join('\r\n');
  }

  // Multi-part mixed email with attachment
  const mimeType = attachment.mimeType || 'application/octet-stream';
  const fileName = (attachment.name || 'attachment').replace(/[^\w.-]/g, '_');

  return [
    `To: ${cleanTo}`,
    `Subject: =?UTF-8?B?${typeof btoa === 'function' ? btoa(encodeURIComponent(cleanSubject).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))) : Buffer.from(cleanSubject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    formattedBody,
    '',
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`,
    '',
    attachment.base64Data.replace(/(\r\n|\n|\r)/gm, ''),
    '',
    `--${boundary}--`
  ].join('\r\n');
}

/**
 * Convert 1-based column number to spreadsheet column letter (1 -> A, 27 -> AA)
 */
export function columnToLetter(col) {
  let letter = '';
  let temp = col;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Extract Google Sheets ID from URL
 */
export function extractSheetId(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : (url.length > 20 && !url.includes('/') ? url.trim() : null);
}

/**
 * Promisified random delay between min and max milliseconds
 */
export function randomDelay(minMs = 10000, maxMs = 20000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats status for visual badges
 */
export function formatStatus(status) {
  switch (status) {
    case 'Sent ✓':     return { label: 'Sent', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
    case 'Failed ✗':   return { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
    case 'Skipped ⏭':  return { label: 'Skipped', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    case 'Pending ⏳':  return { label: 'Pending', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' };
    case 'Queued 📋':   return { label: 'Queued', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' };
    default:            return { label: status || 'Idle', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' };
  }
}

/**
 * Format minutes from midnight into 12-hour display string (e.g., 570 -> "09:30 AM")
 */
export function formatMinutesToDisplay(totalMinutes) {
  if (typeof totalMinutes !== 'number' || isNaN(totalMinutes)) return '12:00 AM';
  let hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = Math.floor(totalMinutes % 60);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;
  const hStr = String(displayHour).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  return `${hStr}:${mStr} ${meridiem}`;
}

/**
 * Parse human time string like "09:00 AM", "9:15 pm", or "14:30" into minutes from midnight (0 - 1439)
 */
export function parseTimeStrToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const cleaned = timeStr.trim();

  // 12-hour format: "09:15 AM", "9:5 PM"
  const match12 = cleaned.match(/^(\d{1,2}):(\d{1,2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }

  // 24-hour format: "09:15", "14:30"
  const match24 = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Check if the current local time falls within the scheduled active window and days
 */
export function isCurrentTimeInWindow(activeDays, startTimeStr, endTimeStr) {
  const now = new Date();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayKey = dayNames[now.getDay()];

  // Active days check
  const days = Array.isArray(activeDays) && activeDays.length > 0
    ? activeDays.map(d => String(d).toLowerCase())
    : ['mon', 'tue', 'wed', 'thu', 'fri'];

  if (!days.includes(todayKey)) {
    return {
      inWindow: false,
      reason: `Today (${todayKey.toUpperCase()}) is not an active scheduled day (${days.map(d => d.toUpperCase()).join(', ')})`,
    };
  }

  const sStr = startTimeStr || '09:00 AM';
  const eStr = endTimeStr || '05:00 PM';
  const startMin = parseTimeStrToMinutes(sStr);
  const endMin = parseTimeStrToMinutes(eStr);

  if (startMin === null || endMin === null) {
    return {
      inWindow: false,
      reason: `Invalid schedule time format (Start: "${sStr}", End: "${eStr}")`,
    };
  }

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const nowDisplay = formatMinutesToDisplay(currentMin);

  if (startMin <= endMin) {
    // Normal daytime window (e.g. 09:00 AM - 05:00 PM)
    if (currentMin < startMin || currentMin > endMin) {
      return {
        inWindow: false,
        reason: `Current time (${nowDisplay}) is outside window (${sStr} - ${eStr})`,
      };
    }
  } else {
    // Overnight window (e.g. 10:00 PM - 06:00 AM)
    if (currentMin < startMin && currentMin > endMin) {
      return {
        inWindow: false,
        reason: `Current time (${nowDisplay}) is outside overnight window (${sStr} - ${eStr})`,
      };
    }
  }

  return { inWindow: true, nowDisplay, sStr, eStr };
}

