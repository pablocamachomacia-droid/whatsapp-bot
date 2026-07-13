import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { logger } from './utils/logger';
import { registerProcessErrorHandlers } from './utils/processErrorHandlers';
import { webhookRouter } from './routes/webhook';
import { leadsRouter } from './routes/leads';
import { dashboardApiRouter } from './routes/dashboardApi';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { webhookRateLimiter, apiRateLimiter } from './middleware/rateLimiters';
import { startLeadBackupSchedule } from './services/leadManager';
import { startDailySummarySchedule } from './services/dailySummary';
import { startUptimeTracking } from './services/uptimeTracker';

registerProcessErrorHandlers();

const app = express();

// Railway (y la mayoria de PaaS) sirven detras de un proxy: sin esto, express-rate-limit
// contaria todas las peticiones bajo una unica IP (la del proxy).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);

app.use(
  express.json({
    // Guarda los bytes crudos del body: necesarios para verificar la firma HMAC de Meta
    verify: (req: express.Request, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use('/health', healthRouter);
app.use('/webhook', webhookRateLimiter, webhookRouter);
app.use('/leads', apiRateLimiter, leadsRouter);
app.use('/api/dashboard', apiRateLimiter, dashboardApiRouter);
app.use('/dashboard', express.static(path.join(process.cwd(), 'dashboard')));

// Debe ser el ultimo middleware registrado
app.use(errorHandler);

startLeadBackupSchedule();
startDailySummarySchedule();
startUptimeTracking();

app.listen(env.port, () => {
  logger.info(`Servidor escuchando en http://localhost:${env.port}`);
});
