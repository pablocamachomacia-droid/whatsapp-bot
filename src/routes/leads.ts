import { Router } from 'express';
import { requireInternalApiKey } from '../middleware/internalAuth';
import { getLeads, updateLeadStatus } from '../services/leadManager';
import { LeadStatus } from '../types/appointment';

export const leadsRouter = Router();

const VALID_STATUSES: LeadStatus[] = ['new', 'contacted', 'confirmed', 'cancelled'];

leadsRouter.use(requireInternalApiKey);

leadsRouter.get('/:businessId', (req, res) => {
  const leads = getLeads(req.params.businessId);
  res.json(leads);
});

leadsRouter.post('/:id/status', (req, res) => {
  const { status } = req.body as { status?: string };

  if (!status || !VALID_STATUSES.includes(status as LeadStatus)) {
    res.status(400).json({ error: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  const updated = updateLeadStatus(req.params.id, status as LeadStatus);

  if (!updated) {
    res.status(404).json({ error: 'Lead no encontrado' });
    return;
  }

  res.json(updated);
});
