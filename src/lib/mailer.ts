import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter =
      env.MAIL_TRANSPORT === 'smtp'
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
          })
        : // Development/test: render the message as JSON instead of sending it.
          nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

/** Messages sent through the JSON transport, kept for tests and local debugging. */
export const sentMail: MailMessage[] = [];

export async function sendMail(message: MailMessage): Promise<void> {
  const info = await getTransporter().sendMail({
    from: env.MAIL_FROM,
    ...message,
  });
  if (env.MAIL_TRANSPORT === 'json') {
    sentMail.push(message);
    if (sentMail.length > 100) sentMail.shift();
    logger.info({ to: message.to, subject: message.subject }, 'email captured (json transport)');
    logger.debug({ text: message.text }, 'email body');
  } else {
    logger.info({ to: message.to, subject: message.subject, messageId: info.messageId }, 'email sent');
  }
}
