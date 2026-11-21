import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import compression from "compression";
import hpp from "hpp";
import crypto from "crypto";
import dotenv from "dotenv";
import dns from "node:dns";
import authRoutes from "./backend/src/routes/auth.routes.js";
import eventRoutes from "./backend/src/routes/event.routes.js";
import achievementRoutes from "./backend/src/routes/achievement.routes.js";
import adminRoutes from "./backend/src/routes/admin.routes.js";
import publicRoutes from './backend/src/routes/public.routes.js';
import userRoutes from './backend/src/routes/user.routes.js';
import { crossSiteCookieOptions } from './backend/src/config/cookie-options.js';

dotenv.config();
dns.setDefaultResultOrder("ipv4first");
const requiredProductionEnv = [
  "DATABASE_URL",
  "JWT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM"
];
if (process.env.NODE_ENV === "production") {
  const missing = requiredProductionEnv.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || [
  "https://anik-iiest-eng.github.io",
  "https://debsociiests.in"
].join(",")).split(",").map((origin) => origin.trim()).filter(Boolean);

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...allowedOrigins],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: process.env.NODE_ENV === "production" ? {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  } : false
}));
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"]
}));
// Lightweight wake-up / uptime endpoint. Registered before the rate limiter so
// monitors and the site's page-load ping never eat into the request budget.
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

app.use(compression());
app.use(hpp());
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
}));


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many authentication attempts, please try again later." }
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);

app.get("/api/csrf-token", (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf_token", token, {
    ...crossSiteCookieOptions(req),
    httpOnly: false,
    maxAge: 2 * 60 * 60 * 1000,
    path: "/"
  });
  res.json({ csrfToken: token });
});

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || !req.cookies.debsoc_token) {
    return next();
  }

  const csrfCookie = req.cookies.csrf_token;
  const csrfHeader = req.get("X-CSRF-Token");
  if (!csrfCookie || !csrfHeader || csrfCookie.length !== csrfHeader.length ||
      !crypto.timingSafeEqual(Buffer.from(csrfCookie), Buffer.from(csrfHeader))) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }

  next();
});


// Routes
app.use('/api/admin', adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/achievements", achievementRoutes);
app.use('/api', publicRoutes);
app.use('/api/users', userRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  const isDevelopment = process.env.NODE_ENV !== "production";
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : "Internal server error",
    ...(isDevelopment ? { stack: err.stack } : {})
  });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});