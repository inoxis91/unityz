import express from 'express';
import pool from '../lib/db';

const router = express.Router();

// Middleware pour vérifier l'authentification
const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

// Middleware pour vérifier si l'utilisateur est admin
const isAdmin = (req: any, res: any, next: any) => {
  if (req.isAuthenticated() && req.user.is_admin === true) {
    return next();
  }
  res.status(403).json({ message: 'Forbidden: Admin access required' });
};

// GET /api/events : Récupère tous les événements
router.get('/', isAuthenticated, async (req: any, res: any) => {
  try {
    const query = `
      SELECT id, title, description, 
             to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             type, created_by
      FROM events 
      ORDER BY start_time ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

// GET /api/events/:id : Récupère un événement spécifique
router.get('/:id', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT id, title, description, 
             to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as start_time,
             to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS') as end_time,
             type, created_by
      FROM events 
      WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ message: 'Failed to fetch event' });
  }
});

// GET /api/events/:id/signups : Récupère les inscriptions pour un événement
router.get('/:id/signups', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT s.*, 
             c.name as character_name, c.class as character_class,
             mc.name as main_character_name, mc.class as main_character_class,
             u.battletag,
             s.created_at as signup_date
      FROM event_signups s 
      LEFT JOIN characters c ON s.character_id = c.id 
      LEFT JOIN characters mc ON s.user_id = mc.user_id AND mc.is_main = TRUE
      JOIN users u ON s.user_id = u.id 
      WHERE s.event_id = $1
      ORDER BY s.created_at ASC
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching signups:', error);
    res.status(500).json({ message: 'Failed to fetch signups' });
  }
});

// POST /api/events : Crée un événement (Admin uniquement)
router.post('/', isAdmin, async (req: any, res: any) => {
  const { title, description, start_time, end_time, type } = req.body;
  try {
    const query = `
      INSERT INTO events (title, description, start_time, end_time, type, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await pool.query(query, [title, description, start_time, end_time, type, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ message: 'Failed to create event' });
  }
});

// PUT /api/events/:id : Modifie un événement (Admin uniquement)
router.put('/:id', isAdmin, async (req: any, res: any) => {
  const { id } = req.params;
  const { title, description, start_time, end_time, type } = req.body;
  try {
    const query = `
      UPDATE events 
      SET title = $1, description = $2, start_time = $3, end_time = $4, type = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    const result = await pool.query(query, [title, description, start_time, end_time, type, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ message: 'Failed to update event' });
  }
});

// DELETE /api/events/:id : Supprime un événement (Admin uniquement)
router.delete('/:id', isAdmin, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const query = 'DELETE FROM events WHERE id = $1';
    const result = await pool.query(query, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ message: 'Failed to delete event' });
  }
});

// POST /api/events/:id/signup : S'inscrire à un événement
router.post('/:id/signup', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;
  const { character_id, role, comment, status } = req.body;
  
  // Si character_id est vide (cas d'une absence), on le met à null pour la base
  const charId = character_id && character_id !== '' ? character_id : null;

  try {
    const query = `
      INSERT INTO event_signups (event_id, user_id, character_id, role, comment, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_id, user_id) 
      DO UPDATE SET 
        character_id = EXCLUDED.character_id, 
        role = EXCLUDED.role, 
        comment = EXCLUDED.comment, 
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(query, [id, req.user.id, charId, role, comment, status || 'signed_up']);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error signing up for event:', error);
    res.status(500).json({ message: 'Failed to sign up for event' });
  }
});

// DELETE /api/events/:id/signup : Se désinscrire d'un événement
router.delete('/:id/signup', isAuthenticated, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const query = 'DELETE FROM event_signups WHERE event_id = $1 AND user_id = $2';
    const result = await pool.query(query, [id, req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Signup not found' });
    }
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing from event:', error);
    res.status(500).json({ message: 'Failed to unsubscribe from event' });
  }
});

export default router;
