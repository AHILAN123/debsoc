import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcrypt';
import { body } from 'express-validator';
import { Resend } from 'resend';
import prisma from '../config/db.js';
import { createToken } from '../utils/token.js';
import { validate } from '../middlewares/validate.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { generateOtp, hashOtp, verifyOtpHash } from '../utils/otp.js';
import { crossSiteCookieOptions } from '../config/cookie-options.js';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || 'backend/.env' });
dotenv.config();

const router = express.Router();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (recipient, otp) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY must be configured');
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM must be configured');
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [recipient],
    subject: 'DebSoc Account Verification',
    text: `Your DebSoc verification code is ${otp}. It expires in 5 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#202124;max-width:520px">
        <h2 style="margin-bottom:8px">DebSoc Account Verification</h2>
        <p>Your verification code is:</p>

        <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0">
          ${otp}
        </p>

        <p>
          This code expires in 5 minutes.
          If you did not request it, you can ignore this email.
        </p>
      </div>
    `
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Failed to send verification email');
  }

  return data;
};
const dispatchOtpEmail = async (recipient, otp) => {
  return await sendOtpEmail(recipient, otp);
};

const sendPasswordResetOtpEmail = async (recipient, otp) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY must be configured');
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM must be configured');
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [recipient],
    subject: 'DebSoc Password Reset',
    text: `Your DebSoc password reset code is ${otp}. It expires in 5 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#202124;max-width:520px">
        <h2 style="margin-bottom:8px">DebSoc Password Reset</h2>
        <p>Your password reset code is:</p>

        <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0">
          ${otp}
        </p>

        <p>
          This code expires in 5 minutes.
          If you did not request a password reset, you can ignore this email.
        </p>
      </div>
    `
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Failed to send password reset email');
  }

  return data;
};


const getMailError = (error) => {
  console.error('Email error:', error);

  return 'Verification email could not be sent. Please try again.';
};

const OTP_TTL_MS = 5 * 60 * 1000;

const cleanupExpiredPendingUsers = async () => {
  try {
    await prisma.user.deleteMany({
      where: {
        isVerified: false,
        otps: {
          some: { expiresAt: { lt: new Date() } },
          none: { expiresAt: { gte: new Date() } }
        }
      }
    });
  } catch (error) {
    console.error('Pending user cleanup failed:', error);
  }

  try {
    await prisma.passwordResetOtp.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
  } catch (error) {
    console.error('Password reset OTP cleanup failed:', error);
  }
};

const pendingUserCleanupTimer = setInterval(cleanupExpiredPendingUsers, 60 * 1000);
pendingUserCleanupTimer.unref?.();
void cleanupExpiredPendingUsers();

const authCookieOptions = (req) => ({
  ...crossSiteCookieOptions(req),
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 })
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    const token = createToken(user);
    res.cookie('debsoc_token', token, authCookieOptions(req));
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// Session check: the front end calls this to confirm the cookie is still valid
// (localStorage alone can outlive the 7-day cookie).
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, displayName: true, email: true, role: true }
    });
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ user });
  } catch (error) {
    console.error('Session check error:', error);
    return res.status(500).json({ error: 'Could not verify session.' });
  }
});

router.post('/register', [
  body('displayName').isString().trim().isLength({ min: 2, max: 100 }),
  body('username').isString().trim().matches(/^[a-zA-Z0-9_.-]{3,32}$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 })
], validate, async (req, res) => {
  const { displayName, username, email, password } = req.body;

  try {
    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedUsername = String(username).trim();
    const trimmedDisplayName = String(displayName).trim();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { username: trimmedUsername }
        ]
      }
    });

    // Existing account
    if (existingUser) {
      // Fully registered account
      if (existingUser.isVerified) {
        return res.status(400).json({ error: 'User already exists.' });
      }

      // Pending account:
      // allow the user to register again with the same email.
      // But don't allow them to steal/change an already-pending username.
      if (
        existingUser.email !== normalizedEmail &&
        existingUser.username === trimmedUsername
      ) {
        return res.status(400).json({
          error: 'Username is already pending verification.'
        });
      }

      if (
        existingUser.email === normalizedEmail &&
        existingUser.username !== trimmedUsername
      ) {
        return res.status(400).json({
          error: 'An account with this email is already pending verification. Please use the same username or wait for it to expire.'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const { user, otpRecord } = await prisma.$transaction(async (tx) => {
      const record = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              displayName: trimmedDisplayName,
              passwordHash
            }
          })
        : await tx.user.create({
            data: {
              displayName: trimmedDisplayName,
              username: trimmedUsername,
              email: normalizedEmail,
              passwordHash,
              isVerified: false
            }
          });

      // Remove previous OTPs first
      await tx.otpVerification.deleteMany({
        where: { userId: record.id }
      });

      const newOtpRecord = await tx.otpVerification.create({
        data: {
          userId: record.id,
          otpHash,
          expiresAt
        }
      });

      return {
        user: record,
        otpRecord: newOtpRecord
      };
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error(
        `OTP email dispatch failed for ${normalizedEmail}:`,
        emailError
      );

      // IMPORTANT:
      // Email failed, so remove the temporary account and its OTP.
      if (!user.isVerified) {
        await prisma.$transaction([
          prisma.otpVerification.deleteMany({
            where: { userId: user.id }
          }),
          prisma.user.delete({
            where: { id: user.id }
          })
        ]);
      }

      return res.status(503).json({
        error: getMailError(emailError)
      });
    }

    return res.status(200).json({
      message: 'OTP sent to your email.'
    });

  } catch (error) {
    console.error('Register error:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        error: 'Username or email is already in use.'
      });
    }

    return res.status(500).json({
      error: 'Failed to dispatch verification email.'
    });
  }
});

router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(),
  body('otp').isString().matches(/^\d{6}$/)
], validate, async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(400).json({ error: 'No OTP request found for this email. Please request a new one.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'Account already verified. Please log in.' });
    }

    const otpRecord = await prisma.otpVerification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'No OTP request found for this email. Please request a new one.' });
    }

    if (Date.now() > otpRecord.expiresAt.getTime()) {
      await prisma.user.delete({ where: { id: user.id } });
      return res.status(400).json({ error: 'OTP has expired. Please register again.' });
    }

    if (!verifyOtpHash(String(otp || '').trim(), otpRecord.otpHash)) {
      return res.status(400).json({ error: 'Incorrect OTP code.' });
    }

    const verifiedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });
      await tx.otpVerification.deleteMany({ where: { userId: user.id } });
      return updated;
    });

    const token = createToken(verifiedUser);
    res.cookie('debsoc_token', token, authCookieOptions(req));
    return res.status(200).json({
      message: 'Account successfully verified!',
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        username: verifiedUser.username,
        displayName: verifiedUser.displayName,
        role: verifiedUser.role
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Could not complete registration in database.' });
  }
});

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], validate, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ error: 'No account found with this email.' });
    }

    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetOtp.create({
      data: { userId: user.id, otpHash, expiresAt }
    });

    try {
      await sendPasswordResetOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error(`Password reset OTP dispatch failed for ${normalizedEmail}:`, emailError);
      return res.status(503).json({ error: getMailError(emailError) });
    }

    return res.status(200).json({ message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Failed to process request.' });
  }
});

router.post('/verify-reset-otp', [
  body('email').isEmail().normalizeEmail(),
  body('otp').isString().matches(/^\d{6}$/)
], validate, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const otpRecord = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    if (Date.now() > otpRecord.expiresAt.getTime()) {
      await prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } });
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (!verifyOtpHash(String(otp || '').trim(), otpRecord.otpHash)) {
      return res.status(400).json({ error: 'Incorrect OTP code.' });
    }

    return res.status(200).json({ message: 'OTP verified. You can now reset your password.' });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    return res.status(500).json({ error: 'Could not verify OTP.' });
  }
});

router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('otp').isString().matches(/^\d{6}$/),
  body('newPassword').isString().isLength({ min: 8, max: 128 })
], validate, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const otpRecord = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    if (Date.now() > otpRecord.expiresAt.getTime()) {
      await prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } });
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (!verifyOtpHash(String(otp || '').trim(), otpRecord.otpHash)) {
      return res.status(400).json({ error: 'Incorrect OTP code.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } })
    ]);

    return res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
});

router.post('/logout', (req, res) => {
  const cookieOptions = { ...crossSiteCookieOptions(req), path: '/' };
  res.clearCookie('debsoc_token', { ...cookieOptions, httpOnly: true });
  res.clearCookie('csrf_token', { ...cookieOptions, httpOnly: false });
  return res.json({ message: 'Logged out successfully.' });
});

export default router;