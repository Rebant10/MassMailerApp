/**
 * Mass Mailer Mobile — Resilient File System Utilities
 * Uses React Native's native fetch + Blob + FileReader pipeline.
 * Completely immune to expo-file-system deprecation stubs and SAF/content URI issues.
 */

/**
 * Read a local file uri (content://, file://, or cache) as a Base64 string for Gmail attachments.
 */
export async function readFileAsBase64(uri) {
  if (!uri) throw new Error('File URI is required');

  try {
    // Primary & most reliable across all RN/Expo versions: fetch + Blob + FileReader
    const response = await fetch(uri);
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const result = reader.result;
          if (typeof result === 'string') {
            // Strip data:...;base64, prefix if present
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          } else {
            reject(new Error('FileReader returned unexpected data type'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => {
        reject(new Error('FileReader failed to read file blob'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (primaryErr) {
    console.warn('Native FileReader failed, attempting direct native module...', primaryErr.message);

    // Fallback: Try direct Expo native FileSystem module if available
    try {
      const { NativeModulesProxy } = require('expo-modules-core');
      const ExponentFS = NativeModulesProxy?.ExponentFileSystem;
      if (ExponentFS?.readAsStringAsync) {
        return await ExponentFS.readAsStringAsync(uri, { encoding: 'base64' });
      }
    } catch (_) {}

    throw new Error(`Could not read attachment: ${primaryErr.message}`);
  }
}

/**
 * Read a local file uri (content:// or file://) as a UTF-8 text string (for CSV imports).
 */
export async function readFileAsText(uri) {
  if (!uri) throw new Error('File URI is required');

  try {
    const response = await fetch(uri);
    return await response.text();
  } catch (primaryErr) {
    console.warn('Native fetch text failed, trying fallback...', primaryErr.message);

    try {
      const { NativeModulesProxy } = require('expo-modules-core');
      const ExponentFS = NativeModulesProxy?.ExponentFileSystem;
      if (ExponentFS?.readAsStringAsync) {
        return await ExponentFS.readAsStringAsync(uri, { encoding: 'utf8' });
      }
    } catch (_) {}

    throw new Error(`Could not read text file: ${primaryErr.message}`);
  }
}
