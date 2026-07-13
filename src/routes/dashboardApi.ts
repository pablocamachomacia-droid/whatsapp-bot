import { Router } from 'express';
import { requireInternalApiKey } from '../middleware/internalAuth';
import { getBusinessById } from '../config/businesses';
import { getLeads, getMonthlyStats, LeadStats } from '../services/leadManager';
import { getTodayMessageCount } from '../services/messageStats';
import { isBusinessHours } from '../utils/businessHours';
import { Lead } from '../types/appointment';

export const dashboardApiRouter = Router();

interface DashboardResponse {
  business: {
    name: string;
    isOpen: boolean;
  };
  stats: LeadStats & { todayMessages: number };
  leads: Lead[];
}

dashboardApiRouter.use(requireInternalApiKey);

dashboardApiRouter.get('/:businessId', (req, res) => {
  const business = getBusinessById(req.params.businessId);

  if (!business) {
    res.status(404).json({ error: 'Negocio no encontrado' });
    return;
  }

  const stats = getMonthlyStats(business.id);

  const responseBody: DashboardResponse = {
    business: {
      name: business.name,
      isOpen: isBusinessHours(business.schedule),
    },
    stats: {
      ...stats,
      todayMessages: getTodayMessageCount(business.id),
    },
    leads: getLeads(business.id),
  };

  res.json(responseBody);
});
