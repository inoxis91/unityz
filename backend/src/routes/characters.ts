import express from 'express';
import axios from 'axios';
import pool from '../lib/db';

const router = express.Router();

// Middleware pour vérifier l'authentification
const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

// GET /api/characters/bnet : Récupère les personnages depuis Battle.net
router.get('/bnet', isAuthenticated, async (req: any, res: any) => {
  try {
    const accessToken = req.user.access_token;
    console.log('--- Character Fetch Attempt ---');
    console.log('User:', req.user.battletag);
    console.log('Token present:', !!accessToken);

    if (!accessToken) {
      console.error('CRITICAL: No access token for user', req.user.battletag);
      return res.status(401).json({ message: 'No Battle.net token found. Please relogin.' });
    }

    console.log('Calling Blizzard API: https://eu.api.blizzard.com/profile/user/wow');
    try {
      const response = await axios.get('https://eu.api.blizzard.com/profile/user/wow', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { namespace: 'profile-eu', locale: 'fr_FR' }
      });

      console.log('Blizzard API Success!');
      const accounts = response.data.wow_accounts || [];
      let allCharacters: any[] = [];

      accounts.forEach((account: any) => {
        if (account.characters && Array.isArray(account.characters)) {
          account.characters.forEach((char: any) => {
            allCharacters.push({
              name: char.name,
              realm: char.realm.name,
              realmSlug: char.realm.slug,
              class: char.playable_class.name,
              level: char.level,
            });
          });
        }
      });

      console.log(`Found ${allCharacters.length} characters.`);
      res.json(allCharacters);
    } catch (axiosError: any) {
      console.error('Blizzard API Error Details:');
      if (axiosError.response) {
        console.error('Status:', axiosError.response.status);
        console.error('Data:', JSON.stringify(axiosError.response.data));
        res.status(axiosError.response.status).json(axiosError.response.data);
      } else {
        console.error('Message:', axiosError.message);
        res.status(500).json({ message: axiosError.message });
      }
    }
  } catch (error) {
    console.error('Final Catch Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to fetch characters from Battle.net' });
    }
  }
});

// GET /api/characters : Récupère les personnages de l'utilisateur stockés en DB
router.get('/', isAuthenticated, async (req: any, res: any) => {
  try {
    const query = 'SELECT * FROM characters WHERE user_id = $1 ORDER BY is_main DESC, name ASC';
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching DB characters:', error);
    res.status(500).json({ message: 'Failed to fetch characters from database' });
  }
});

// PATCH /api/characters/:id/main : Définit un personnage comme "Main"
router.patch('/:id/main', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;

  try {
    // 1. Désactiver le statut "main" de tous les autres persos de l'utilisateur
    await pool.query('UPDATE characters SET is_main = FALSE WHERE user_id = $1', [req.user.id]);
    
    // 2. Définir le perso sélectionné comme "main"
    const query = `
      UPDATE characters 
      SET is_main = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [id, req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Character not found or not owned by user' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error setting main character:', error);
    res.status(500).json({ message: 'Failed to set main character' });
  }
});

// POST /api/characters/import : Importe les personnages sélectionnés
router.post('/import', isAuthenticated, async (req: any, res: any) => {
  const { characters } = req.body;
  
  if (!characters || !Array.isArray(characters)) {
    return res.status(400).json({ message: 'Invalid characters data' });
  }

  try {
    const userId = req.user.id;
    
    for (const char of characters) {
      const query = `
        INSERT INTO characters (user_id, name, realm, class, level)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name, realm, user_id) DO UPDATE SET
          level = EXCLUDED.level,
          class = EXCLUDED.class,
          updated_at = CURRENT_TIMESTAMP
      `;
      await pool.query(query, [userId, char.name, char.realm, char.class, char.level]);
    }

    res.json({ message: 'Characters imported successfully' });
  } catch (error) {
    console.error('Error importing characters:', error);
    res.status(500).json({ message: 'Failed to import characters' });
  }
});

// PATCH /api/characters/:id/roles : Met à jour les rôles d'un personnage
router.patch('/:id/roles', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;
  const { isTank, isHeal, isDPS } = req.body;

  try {
    const query = `
      UPDATE characters 
      SET is_tank = $1, is_heal = $2, is_dps = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `;
    const result = await pool.query(query, [isTank, isHeal, isDPS, id, req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Character not found or not owned by user' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating roles:', error);
    res.status(500).json({ message: 'Failed to update roles' });
  }
});

// DELETE /api/characters/:id : Supprime un personnage de la base
router.delete('/:id', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const query = 'DELETE FROM characters WHERE id = $1 AND user_id = $2';
    await pool.query(query, [id, req.user.id]);
    res.json({ message: 'Character removed successfully' });
  } catch (error) {
    console.error('Error removing character:', error);
    res.status(500).json({ message: 'Failed to remove character' });
  }
});

export default router;
