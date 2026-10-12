import { env } from '../config/env';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, actionUrl: string, actionLabel: string) {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(actionUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(actionLabel)}</a></p>
<p style="color:#666;font-size:12px">If you did not request this, you can ignore this email.</p></body></html>`;
}

export function verificationEmail(name: string, token: string) {
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your email address',
    text: `Hi ${name},\n\nConfirm your email address by opening: ${url}\n\nThis link expires in ${env.EMAIL_VERIFICATION_TTL}.`,
    html: layout(
      `Hi ${name}`,
      `Confirm your email address. This link expires in ${env.EMAIL_VERIFICATION_TTL}.`,
      url,
      'Verify email',
    ),
  };
}

export function passwordResetEmail(name: string, token: string) {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your password',
    text: `Hi ${name},\n\nReset your password by opening: ${url}\n\nThis link expires in ${env.PASSWORD_RESET_TTL}.`,
    html: layout(
      `Hi ${name}`,
      `Reset your password. This link expires in ${env.PASSWORD_RESET_TTL}.`,
      url,
      'Reset password',
    ),
  };
}
