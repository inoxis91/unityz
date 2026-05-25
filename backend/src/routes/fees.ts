import express from 'express';
import { FeeService } from '../services/feeService';
import { isAuthenticated, isAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createDeclarationSchema, resolveDeclarationSchema } from '../schemas/feeSchemas';

const router = express.Router();

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
    const declaration = await FeeService.declarePayment(req.user!.id, req.body);
    res.status(201).json(declaration);
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/pending : Liste des déclarations à valider (Admin)
router.get('/pending', isAdmin, async (req, res, next) => {
  try {
    const pending = await FeeService.getPendingDeclarations();
    res.json(pending);
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/guild-overview/:year : Vue d'ensemble de la guilde (Admin)
router.get('/guild-overview/:year', isAdmin, async (req, res, next) => {
  try {
    const year = req.params.year as string;
    const overview = await FeeService.getGuildOverview(parseInt(year));
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/fees/resolve/:id : Accepter ou refuser une déclaration (Admin)
router.patch('/resolve/:id', isAdmin, validate(resolveDeclarationSchema), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await FeeService.resolveDeclaration(id, req.body.status, req.body.admin_comment);
    res.json({ status: 'success', message: `Declaration ${req.body.status}` });
  } catch (error) {
    next(error);
  }
});

export default router;
