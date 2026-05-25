import express from 'express';
import axios from 'axios';
import { CharacterService } from '../services/characterService';
import { isAuthenticated } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { importCharactersSchema, updateRolesSchema, setMainSchema } from '../schemas/characterSchemas';

const router = express.Router();

// GET /api/characters/bnet : Récupère les personnages de l'utilisateur via Blizzard
router.get('/bnet', isAuthenticated, async (req, res, next) => {
  try {
    const accessToken = req.user!.access_token;
    if (!accessToken) {
      return res.status(401).json({ status: 'error', message: 'No access token found' });
    }

    const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { namespace: 'profile-eu', locale: 'fr_FR' }
    });

    const accounts = response.data.wow_accounts || [];
    let allCharacters: any[] = [];

    accounts.forEach((account: any) => {
      if (account.characters) {
        account.characters.forEach((char: any) => {
          allCharacters.push({
            name: char.name,
            realm: char.realm.name,
            class: char.character_class.name,
            level: char.level
          });
        });
      }
    });

    res.json(allCharacters);
  } catch (error) {
    next(error);
  }
});

// GET /api/characters : Récupère les personnages de l'utilisateur stockés en DB
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const characters = await CharacterService.getByUserId(req.user!.id);
    res.json(characters);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/characters/:id/main : Définit un personnage comme "Main"
router.patch('/:id/main', isAuthenticated, validate(setMainSchema), async (req, res, next) => {
  try {
    const character = await CharacterService.setMain(req.params.id as string, req.user!.id);
    res.json(character);
  } catch (error) {
    next(error);
  }
});

// POST /api/characters/import : Importe les personnages sélectionnés
router.post('/import', isAuthenticated, validate(importCharactersSchema), async (req, res, next) => {
  try {
    await CharacterService.importCharacters(req.user!.id, req.body.characters);
    res.json({ status: 'success', message: 'Characters imported successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/characters/:id/roles : Met à jour les rôles d'un personnage
router.patch('/:id/roles', isAuthenticated, validate(updateRolesSchema), async (req, res, next) => {
  try {
    const character = await CharacterService.updateRoles(req.params.id as string, req.user!.id, req.body);
    res.json(character);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/characters/:id : Supprime un personnage de la base
router.delete('/:id', isAuthenticated, async (req, res, next) => {
  try {
    await CharacterService.remove(req.params.id as string, req.user!.id);
    res.json({ status: 'success', message: 'Character removed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
