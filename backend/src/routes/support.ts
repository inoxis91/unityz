import { Router } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { validate } from '../middlewares/validate';

const router = Router();

// Recipient email configuration - securely stored on backend
const RECIPIENT_EMAIL = process.env.CONTACT_RECIPIENT_EMAIL || 'inoxis91@gmail.com';

// Configure Transporter
const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  // Fallback / Development: prints to console
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
};

// Zod schemas for validation
const bugSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().min(1, 'Description is required'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  }),
});

const contactSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(1, 'Message is required'),
  }),
});

router.post('/bug', validate(bugSchema), async (req, res, next) => {
  try {
    const { name, email, subject, description, severity } = req.body;

    const transporter = getTransporter();
    const mailOptions = {
      from: `"Guild Manager Support" <${process.env.SMTP_FROM || 'noreply@guildmanager.com'}>`,
      replyTo: `"${name}" <${email}>`,
      to: RECIPIENT_EMAIL,
      subject: `[BUG REPORT - ${severity.toUpperCase()}] ${subject}`,
      text: `Bug Report from: ${name} (${email})\nSeverity: ${severity.toUpperCase()}\n\nDescription:\n${description}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #e53e3e; margin-top: 0;">New Bug Report</h2>
          <p><strong>From:</strong> ${name} (<a href="mailto:${email}">${email}</a>)</p>
          <p><strong>Severity:</strong> <span style="color: ${severity === 'critical' || severity === 'high' ? '#e53e3e' : '#dd6b20'}; font-weight: bold;">${severity.toUpperCase()}</span></p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          <h3 style="color: #4a5568;">Description:</h3>
          <p style="white-space: pre-wrap; background-color: #f7fafc; padding: 15px; border-radius: 6px; color: #2d3748;">${description}</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // If streamTransport is used, we log the email content to stdout for testing
    if ('message' in info) {
      console.log('--- [DEV MAIL SENT] ---');
      console.log((info as any).message.toString());
      console.log('-----------------------');
    }

    res.status(200).json({ success: true, message: 'Bug report sent successfully' });
  } catch (error) {
    next(error);
  }
});

router.post('/contact', validate(contactSchema), async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    const transporter = getTransporter();
    const mailOptions = {
      from: `"Guild Manager Support" <${process.env.SMTP_FROM || 'noreply@guildmanager.com'}>`,
      replyTo: `"${name}" <${email}>`,
      to: RECIPIENT_EMAIL,
      subject: `[CONTACT] ${subject}`,
      text: `Contact message from: ${name} (${email})\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #3182ce; margin-top: 0;">New Contact Message</h2>
          <p><strong>From:</strong> ${name} (<a href="mailto:${email}">${email}</a>)</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          <h3 style="color: #4a5568;">Message:</h3>
          <p style="white-space: pre-wrap; background-color: #f7fafc; padding: 15px; border-radius: 6px; color: #2d3748;">${message}</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // If streamTransport is used, we log the email content to stdout for testing
    if ('message' in info) {
      console.log('--- [DEV MAIL SENT] ---');
      console.log((info as any).message.toString());
      console.log('-----------------------');
    }

    res.status(200).json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
