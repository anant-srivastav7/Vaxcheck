/**
 * utils/emailValidator.js
 *
 * Validates email format AND verifies that the domain has MX records,
 * meaning it is configured to receive email.
 *
 * Uses Node's built-in `dns.promises` — no external API or package needed.
 */

import dns from 'node:dns';

/**
 * Validate an email address:
 *  1. Checks basic format with a regex.
 *  2. Looks up MX records for the domain.
 *
 * @param {string} email
 * @returns {Promise<{ valid: boolean, reason: string }>}
 */
export async function validateEmailDomain(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format.' };
  }

  const domain = email.split('@')[1].toLowerCase();

  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: `The email domain "${domain}" does not appear to exist or cannot receive emails. Please use a valid email address.`,
      };
    }
    return { valid: true, reason: '' };
  } catch (err) {
    // ENOTFOUND / ENODATA / ESERVFAIL all indicate the domain doesn't exist or has no mail server
    if (
      err.code === 'ENOTFOUND' ||
      err.code === 'ENODATA' ||
      err.code === 'ESERVFAIL' ||
      err.code === 'EREFUSED'
    ) {
      return {
        valid: false,
        reason: `The email domain "${domain}" does not exist. Please provide a real, deliverable email address.`,
      };
    }
    // Network error or timeout — allow through rather than blocking valid users
    console.warn(`[emailValidator] DNS lookup failed for "${domain}" (${err.code}), allowing through.`);
    return { valid: true, reason: '' };
  }
}
