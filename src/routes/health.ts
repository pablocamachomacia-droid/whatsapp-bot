import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getBusinessCount } from '../config/businesses';
import { getAllLeadsCount } from '../services/leadManager';
import { getAverageResponseTime } from '../services/responseTimeStats';
import { getUptimePercentage } from '../services/uptimeTracker';

export const healthRouter = Router();

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = readPackageVersion();

/** Sin autenticacion a proposito: pensado para monitoring externo (uptime checks, Railway healthcheck) */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    uptimePercentage: getUptimePercentage(),
    avgResponseTime: getAverageResponseTime(),
    version,
    timestamp: new Date().toISOString(),
    businessCount: getBusinessCount(),
    totalLeads: getAllLeadsCount(),
  });
});
