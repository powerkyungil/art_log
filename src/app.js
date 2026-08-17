import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { config } from './config.js';
import adminRoutes from './routes/adminRoutes.js';
import artistRoutes from './routes/artistRoutes.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { flashMiddleware } from './middleware/flash.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { displayName, formatDate, formatDateTime, statusClass, statusLabel, toDateTimeLocal } from './utils/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../src/views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));
app.use(flashMiddleware);
app.use(csrfMiddleware);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentAdmin = req.session.adminName ? { name: req.session.adminName } : null;
  res.locals.formatDate = formatDate;
  res.locals.formatDateTime = formatDateTime;
  res.locals.toDateTimeLocal = toDateTimeLocal;
  res.locals.displayName = displayName;
  res.locals.statusLabel = statusLabel;
  res.locals.statusClass = statusClass;
  next();
});

app.use('/', artistRoutes);
app.use('/admin', adminRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
