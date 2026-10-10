/**
 * utils/emailService.js
 *
 * Centralised email sender for VaxCheck using nodemailer.
 *
 * Configure via .env:
 *   EMAIL_HOST=smtp.gmail.com
 *   EMAIL_PORT=587
 *   EMAIL_SECURE=false
 *   EMAIL_USER=your-vaxcheck-bot@gmail.com
 *   EMAIL_PASS=your-app-specific-password
 *   EMAIL_FROM=VaxCheck <your-vaxcheck-bot@gmail.com>
 *
 * If EMAIL_USER / EMAIL_PASS are absent the mailer falls back to
 * console.log so the rest of the app still works during development.
 */
import nodemailer from 'nodemailer';

let cachedEtherealTransporter = null;

/**
 * Creates or retrieves the Nodemailer transporter.
 * Supports:
 *   1. Real Gmail (via service: 'gmail', requires EMAIL_USER and EMAIL_PASS app password)
 *   2. Custom SMTP (via EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)
 *   3. Ethereal Test Account fallback (automatically creates a disposable mailbox with browser preview URLs)
 */
async function getTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS, EMAIL_SERVICE } = process.env;

  // Real credentials configured in .env
  if (EMAIL_USER && EMAIL_PASS) {
    const isGmail =
      EMAIL_SERVICE === 'gmail' ||
      EMAIL_USER.endsWith('@gmail.com') ||
      (EMAIL_HOST && EMAIL_HOST.includes('gmail'));

    const transporter = isGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: { user: EMAIL_USER.trim(), pass: EMAIL_PASS.trim() },
        })
      : nodemailer.createTransport({
          host: EMAIL_HOST || 'smtp.gmail.com',
          port: Number(EMAIL_PORT) || 587,
          secure: EMAIL_SECURE === 'true',
          auth: { user: EMAIL_USER.trim(), pass: EMAIL_PASS.trim() },
        });

    return {
      transporter,
      isDevFallback: false,
      fromEmail: process.env.EMAIL_FROM || `VaxCheck <${EMAIL_USER.trim()}>`,
    };
  }

  // Fallback: Use Ethereal test inbox so emails can be viewed in browser without crashing
  if (!cachedEtherealTransporter) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      cachedEtherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log(`\n📮 [EmailService] Using Ethereal test mailer (${testAccount.user}). View emails at generated URLs.`);
    } catch (err) {
      console.warn('⚠️ [EmailService] Could not initialize Ethereal test mailer:', err.message);
      return { transporter: null, isDevFallback: true, fromEmail: 'VaxCheck <noreply@vaxcheck.app>' };
    }
  }

  return {
    transporter: cachedEtherealTransporter,
    isDevFallback: true,
    fromEmail: 'VaxCheck System <noreply@vaxcheck.app>',
  };
}

/**
 * Internal send helper. Dispatches real emails or generates test preview URLs.
 */
async function send({ to, cc, subject, html, text }) {
  const { transporter, isDevFallback, fromEmail } = await getTransporter();

  if (!transporter) {
    console.log(`\n📧 [EmailService – CONSOLE LOG]\n  To: ${to}\n  CC: ${cc || 'none'}\n  Subject: ${subject}\n  Content:\n${text || html}\n`);
    return { success: false, previewUrl: null, devMode: true };
  }

  try {
    const mailOptions = { from: fromEmail, to, subject, html, text };
    if (cc) mailOptions.cc = cc;

    const info = await transporter.sendMail(mailOptions);

    let previewUrl = null;
    if (isDevFallback) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`\n📬 [EmailService – TEST PREVIEW]
  To: ${to}
  Subject: ${subject}
  🔗 Click here to preview this email: ${previewUrl}
  👉 To send to real inboxes, configure EMAIL_USER and EMAIL_PASS in server/.env\n`);
    } else {
      console.log(`✅ [EmailService] Email successfully delivered to ${to} (messageId: ${info.messageId})`);
    }

    return { success: true, messageId: info.messageId, previewUrl, isDevFallback };
  } catch (err) {
    console.error(`❌ [EmailService] Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message, previewUrl: null };
  }
}

// ── Email Templates ───────────────────────────────────────────────────────────

/**
 * Notify an admin that a new worker has submitted a registration request.
 */
export async function sendWorkerRequestToAdmin({ adminEmail, adminName, workerName, workerEmail, workerMobile, clinicName, dashboardUrl }) {
  const subject = `🩺 New Worker Registration Request — VaxCheck`;
  const text = `
Hello ${adminName},

A new healthcare worker has submitted a registration request to join your clinic on VaxCheck.

Worker Details:
  Name    : ${workerName}
  Email   : ${workerEmail}
  Mobile  : ${workerMobile || 'Not provided'}
  Clinic  : ${clinicName}

To review and approve or reject this request, please visit your Admin Dashboard:
${dashboardUrl}

Requests can be found under the "Pending Approvals" section.

— VaxCheck System
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, Arial, sans-serif; background:#F8FAFC; padding: 32px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0F172A,#1E3A5F); padding:28px 32px; text-align:center;">
      <h1 style="color:#38BDF8; margin:0; font-size:1.5rem; font-weight:800;">VaxCheck</h1>
      <p style="color:#94A3B8; margin:6px 0 0; font-size:.9rem;">Admin Notification</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#0F172A; font-size:1.15rem; font-weight:800; margin:0 0 8px;">New Worker Registration Request</h2>
      <p style="color:#475569; margin:0 0 24px;">Hello <strong>${adminName}</strong>, a new healthcare worker has submitted a registration request for your clinic.</p>

      <div style="background:#F1F5F9; border-radius:10px; padding:16px 20px; margin-bottom:24px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="color:#64748B; font-size:.85rem; padding:5px 0; font-weight:600;">Name</td><td style="color:#0F172A; font-weight:700; font-size:.9rem;">${workerName}</td></tr>
          <tr><td style="color:#64748B; font-size:.85rem; padding:5px 0; font-weight:600;">Email</td><td style="color:#0F172A; font-size:.9rem;">${workerEmail}</td></tr>
          <tr><td style="color:#64748B; font-size:.85rem; padding:5px 0; font-weight:600;">Mobile</td><td style="color:#0F172A; font-size:.9rem;">${workerMobile || 'Not provided'}</td></tr>
          <tr><td style="color:#64748B; font-size:.85rem; padding:5px 0; font-weight:600;">Clinic</td><td style="color:#0F172A; font-size:.9rem;">${clinicName}</td></tr>
        </table>
      </div>

      <a href="${dashboardUrl}" style="display:inline-block; background:linear-gradient(135deg,#2563EB,#0EA5E9); color:#fff; text-decoration:none; padding:13px 28px; border-radius:10px; font-weight:700; font-size:.95rem;">
        Review in Admin Dashboard →
      </a>

      <p style="color:#94A3B8; font-size:.78rem; margin-top:28px;">You received this because a worker selected you as their supervising administrator. Visit Pending Approvals to take action.</p>
    </div>
  </div>
</body>
</html>
  `;

  return await send({ to: adminEmail, subject, html, text });
}

/**
 * Notify a worker that their registration request was approved.
 * Also CCs the approving administrator so they have a confirmation record.
 */
export async function sendWorkerApprovalEmail({ workerEmail, workerName, clinicName, loginUrl, adminEmail }) {
  const subject = `✅ Registration Approved — VaxCheck Worker Portal`;
  const text = `
Hello ${workerName},

Great news! Your VaxCheck worker registration for ${clinicName} has been approved by your administrator.

You can now sign in to your Health Worker Testing Station at:
${loginUrl}

Use the email and password you registered with.

Welcome to the team!
— VaxCheck System
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, Arial, sans-serif; background:#F8FAFC; padding: 32px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#064E3B,#065F46); padding:28px 32px; text-align:center;">
      <h1 style="color:#34D399; margin:0; font-size:1.5rem; font-weight:800;">VaxCheck</h1>
      <p style="color:#6EE7B7; margin:6px 0 0; font-size:.9rem;">Registration Approved 🎉</p>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center; margin-bottom:24px;">
        <div style="width:64px; height:64px; background:rgba(16,185,129,0.15); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:2rem;">✅</div>
      </div>
      <h2 style="color:#0F172A; font-size:1.2rem; font-weight:800; text-align:center; margin:0 0 8px;">You're Approved!</h2>
      <p style="color:#475569; text-align:center; margin:0 0 28px;">Hello <strong>${workerName}</strong>, your registration for <strong>${clinicName}</strong> has been approved by your administrator.</p>

      <div style="text-align:center;">
        <a href="${loginUrl}" style="display:inline-block; background:linear-gradient(135deg,#10B981,#0EA5E9); color:#fff; text-decoration:none; padding:14px 32px; border-radius:10px; font-weight:700; font-size:1rem;">
          Sign In to Worker Portal →
        </a>
      </div>

      <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:10px; padding:14px 18px; margin-top:28px;">
        <p style="color:#065F46; font-size:.85rem; margin:0; font-weight:600;">Login Instructions:</p>
        <p style="color:#047857; font-size:.82rem; margin:6px 0 0;">Use the email and password you registered with on the Worker Sign In page.</p>
      </div>

      <p style="color:#94A3B8; font-size:.78rem; margin-top:24px; text-align:center;">Welcome to the VaxCheck healthcare workforce. Your station is ready.</p>
    </div>
  </div>
</body>
</html>
  `;

  return await send({ to: workerEmail, cc: adminEmail || undefined, subject, html, text });
}

/**
 * Notify a worker that their registration request was rejected.
 * Also CCs the supervising administrator so they have a confirmation record.
 */
export async function sendWorkerRejectionEmail({ workerEmail, workerName, reason, reapplyUrl, adminEmail }) {
  const subject = `Registration Update — VaxCheck Worker Portal`;
  const text = `
Hello ${workerName},

We regret to inform you that your VaxCheck worker registration request could not be approved at this time.

${reason ? `Reason: ${reason}` : 'Please contact your facility administrator for more details.'}

If you believe this is an error or would like to re-apply, please reach out to your facility administrator or visit:
${reapplyUrl}

— VaxCheck System
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, Arial, sans-serif; background:#F8FAFC; padding: 32px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1E293B,#374151); padding:28px 32px; text-align:center;">
      <h1 style="color:#CBD5E1; margin:0; font-size:1.5rem; font-weight:800;">VaxCheck</h1>
      <p style="color:#94A3B8; margin:6px 0 0; font-size:.9rem;">Registration Update</p>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center; margin-bottom:24px;">
        <div style="width:64px; height:64px; background:rgba(239,68,68,0.1); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:2rem;">❌</div>
      </div>
      <h2 style="color:#0F172A; font-size:1.15rem; font-weight:800; text-align:center; margin:0 0 8px;">Registration Not Approved</h2>
      <p style="color:#475569; text-align:center; margin:0 0 24px;">Hello <strong>${workerName}</strong>, we're sorry to inform you that your registration request was not approved at this time.</p>

      ${reason ? `
      <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:14px 18px; margin-bottom:24px;">
        <p style="color:#7F1D1D; font-size:.85rem; margin:0; font-weight:600;">Reason provided by administrator:</p>
        <p style="color:#991B1B; font-size:.88rem; margin:6px 0 0;">${reason}</p>
      </div>
      ` : ''}

      <p style="color:#64748B; font-size:.88rem; margin:0 0 20px;">If you believe this is an error, please contact your facility administrator directly or re-submit your application.</p>

      <div style="text-align:center;">
        <a href="${reapplyUrl}" style="display:inline-block; background:#475569; color:#fff; text-decoration:none; padding:12px 28px; border-radius:10px; font-weight:700; font-size:.9rem;">
          Re-apply or Contact Admin →
        </a>
      </div>

      <p style="color:#94A3B8; font-size:.78rem; margin-top:28px; text-align:center;">— VaxCheck System</p>
    </div>
  </div>
</body>
</html>
  `;

  return await send({ to: workerEmail, cc: adminEmail || undefined, subject, html, text });
}
