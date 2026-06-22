import express from 'express';
import { FeeService } from '../services/feeService';
import { isAuthenticated, canManageFees, requireActiveGuild, requirePaidGuild } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createDeclarationSchema, resolveDeclarationSchema, adjustAllocationSchema } from '../schemas/feeSchemas';

const router = express.Router();

router.use(requireActiveGuild, requirePaidGuild);

// GET /api/fees/my-declarations : Récupère les déclarations de l'utilisateur
router.get('/my-declarations', isAuthenticated, async (req, res, next) => {
  try {
    const declarations = await FeeService.getUserDeclarations(req.user!.id);
    res.json(declarations);
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/my-allocations/:year : Récupère la grille des paiements validés de l'utilisateur
router.get('/my-allocations/:year', isAuthenticated, async (req, res, next) => {
  try {
    const year = req.params.year as string;
    const allocations = await FeeService.getUserAllocations(req.user!.id, parseInt(year));
    res.json(allocations);
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/declare : Déclarer un nouveau paiement
router.post('/declare', isAuthenticated, validate(createDeclarationSchema), async (req, res, next) => {
  try {
    const declaration = await FeeService.declarePayment(req.user!.id, req.body, req.user!.active_guild_id!);
    res.status(201).json(declaration);
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/pending : Liste des déclarations à valider (Admin, Trésorier)
router.get('/pending', canManageFees, async (req, res, next) => {
  try {
    const pending = await FeeService.getPendingDeclarations(req.user!.active_guild_id || undefined);
    res.json(pending);
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/guild-overview/:year : Vue d'ensemble de la guilde (Admin, Trésorier)
router.get('/guild-overview/:year', canManageFees, async (req, res, next) => {
  try {
    const year = req.params.year as string;
    const overview = await FeeService.getGuildOverview(parseInt(year), req.user!.active_guild_id || undefined);
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/fees/resolve/:id : Accepter ou refuser une déclaration (Admin, Trésorier)
router.patch('/resolve/:id', canManageFees, validate(resolveDeclarationSchema), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await FeeService.resolveDeclaration(id, req.body.status, req.body.admin_comment);
    res.json({ status: 'success', message: `Declaration ${req.body.status}` });
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/adjust-allocation : Ajustement manuel d'une cotisation (Admin, Trésorier)
router.post('/adjust-allocation', canManageFees, validate(adjustAllocationSchema), async (req, res, next) => {
  try {
    const { userId, monthDate, amount } = req.body;
    await FeeService.upsertAllocation(userId, monthDate, amount, req.user!.active_guild_id!);
    res.json({ status: 'success', message: 'Allocation adjusted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/remind : Envoi manuel du rappel de cotisation (Admin, Trésorier)
router.post('/remind', canManageFees, async (req, res, next) => {
  try {
    const guildId = req.user!.active_guild_id!;
    const result = await FeeService.sendPaymentReminders(guildId);
    res.json({
      status: 'success',
      message: 'Rappels de cotisation traités.',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

export default router;
