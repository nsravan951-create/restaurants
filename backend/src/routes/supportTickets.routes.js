const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requirePlatformPermission, requirePlatformAccess } = require('../middleware/platformPermissions');
const { writeAuditLog } = require('../utils/auditLog');
const { getAccessibleRestaurantIds, restaurantScopeClause } = require('../utils/rbac');
const { getRestaurantIdForUser } = require('../utils/featureAccess');

const router = express.Router();

// --- Platform team routes ---
const teamRouter = express.Router();
teamRouter.use(requireAuth());
teamRouter.use(requirePlatformAccess());

teamRouter.get('/', requirePlatformPermission('support.view'), asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const priority = String(req.query.priority || '').trim();
  const accessible = await getAccessibleRestaurantIds(req.user.userId, req.user.role);
  const scope = restaurantScopeClause('t.restaurant_id', accessible, 1);

  const conditions = ['1=1'];
  const params = [...scope.params];
  let idx = scope.nextIndex;

  if (scope.clause) conditions.push(scope.clause.replace(' AND ', ''));
  if (status) {
    conditions.push(`t.status = $${idx++}`);
    params.push(status);
  }
  if (priority) {
    conditions.push(`t.priority = $${idx++}`);
    params.push(priority);
  }

  const { rows } = await pool.query(
    `SELECT t.*, r.name AS restaurant_name, cu.name AS created_by_name, cu.email AS created_by_email,
            au.name AS assigned_to_name
     FROM support_tickets t
     LEFT JOIN restaurants r ON r.id = t.restaurant_id
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     LEFT JOIN users au ON au.id = t.assigned_to_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
       t.created_at DESC
     LIMIT 300`,
    params
  ).catch(() => ({ rows: [] }));

  return res.json({ tickets: rows });
}));

teamRouter.get('/:id', requirePlatformPermission('support.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT t.*, r.name AS restaurant_name, cu.name AS created_by_name, cu.email AS created_by_email,
            au.name AS assigned_to_name
     FROM support_tickets t
     LEFT JOIN restaurants r ON r.id = t.restaurant_id
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     LEFT JOIN users au ON au.id = t.assigned_to_user_id
     WHERE t.id = $1 LIMIT 1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Ticket not found' });

  const { rows: messages } = await pool.query(
    `SELECT m.*, u.name AS author_name
     FROM support_ticket_messages m
     LEFT JOIN users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1 AND m.is_internal = FALSE
     ORDER BY m.created_at ASC`,
    [id]
  ).catch(() => ({ rows: [] }));

  const { rows: internalNotes } = await pool.query(
    `SELECT m.*, u.name AS author_name
     FROM support_ticket_messages m
     LEFT JOIN users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1 AND m.is_internal = TRUE
     ORDER BY m.created_at ASC`,
    [id]
  ).catch(() => ({ rows: [] }));

  return res.json({ ticket: rows[0], messages, internalNotes });
}));

teamRouter.post('/', requirePlatformPermission('support.manage'), asyncHandler(async (req, res) => {
  const { restaurantId, subject, category, priority, description } = req.body || {};
  if (!subject || String(subject).trim().length < 3) {
    return res.status(400).json({ message: 'subject is required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO support_tickets (
       restaurant_id, created_by_user_id, subject, category, priority, description
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      restaurantId ? Number(restaurantId) : null,
      req.user.userId,
      String(subject).trim(),
      category || 'general',
      priority || 'normal',
      description || null,
    ]
  );

  if (description) {
    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, message)
       VALUES ($1, $2, $3, $4)`,
      [rows[0].id, req.user.userId, req.user.role, String(description)]
    );
  }

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: restaurantId ? Number(restaurantId) : null,
    action: 'support_ticket_created',
    resourceType: 'support_ticket',
    resourceId: rows[0].id,
    ipAddress: req.ip,
  });

  return res.status(201).json({ ticket: rows[0] });
}));

teamRouter.patch('/:id', requirePlatformPermission('support.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status, priority, assignedToUserId, category } = req.body || {};

  const { rows } = await pool.query(
    `UPDATE support_tickets SET
       status = COALESCE($1, status),
       priority = COALESCE($2, priority),
       assigned_to_user_id = COALESCE($3, assigned_to_user_id),
       category = COALESCE($4, category),
       resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN CURRENT_TIMESTAMP ELSE resolved_at END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      status || null,
      priority || null,
      assignedToUserId != null ? Number(assignedToUserId) : null,
      category || null,
      id,
    ]
  );
  if (!rows.length) return res.status(404).json({ message: 'Ticket not found' });

  await writeAuditLog({
    actorUserId: req.user.userId,
    actorRole: req.user.role,
    restaurantId: rows[0].restaurant_id,
    action: 'support_ticket_updated',
    resourceType: 'support_ticket',
    resourceId: id,
    metadata: { status, priority },
    ipAddress: req.ip,
  });

  return res.json({ ticket: rows[0] });
}));

teamRouter.post('/:id/messages', requirePlatformPermission('support.respond'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { message, isInternal } = req.body || {};
  if (!message || String(message).trim().length < 1) {
    return res.status(400).json({ message: 'message is required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, message, is_internal)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, req.user.userId, req.user.role, String(message).trim(), Boolean(isInternal)]
  );

  await pool.query(
    `UPDATE support_tickets SET
       status = CASE WHEN $2 = TRUE THEN status ELSE 'in_progress' END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, Boolean(isInternal)]
  );

  return res.status(201).json({ message: rows[0] });
}));

// --- Owner routes ---
const ownerRouter = express.Router();
ownerRouter.use(requireAuth(['owner']));

ownerRouter.get('/', asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  const { rows } = await pool.query(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.created_at, t.updated_at, t.resolved_at
     FROM support_tickets t
     WHERE t.created_by_user_id = $1 OR t.restaurant_id = $2
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [req.user.userId, restaurantId]
  ).catch(() => ({ rows: [] }));

  return res.json({ tickets: rows });
}));

ownerRouter.post('/', asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  const { subject, category, priority, description } = req.body || {};
  if (!subject || String(subject).trim().length < 3) {
    return res.status(400).json({ message: 'subject is required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO support_tickets (
       restaurant_id, created_by_user_id, subject, category, priority, description
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, subject, category, priority, status, created_at`,
    [
      restaurantId,
      req.user.userId,
      String(subject).trim(),
      category || 'general',
      priority || 'normal',
      description || null,
    ]
  );

  if (description) {
    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, message)
       VALUES ($1, $2, 'owner', $3)`,
      [rows[0].id, req.user.userId, String(description)]
    );
  }

  return res.status(201).json({ ticket: rows[0] });
}));

ownerRouter.get('/:id', asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  const id = Number(req.params.id);

  const { rows } = await pool.query(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.created_at, t.updated_at, t.resolved_at
     FROM support_tickets t
     WHERE t.id = $1 AND (t.created_by_user_id = $2 OR t.restaurant_id = $3)
     LIMIT 1`,
    [id, req.user.userId, restaurantId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Ticket not found' });

  const { rows: messages } = await pool.query(
    `SELECT m.id, m.message, m.author_role, m.created_at, u.name AS author_name
     FROM support_ticket_messages m
     LEFT JOIN users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1 AND m.is_internal = FALSE
     ORDER BY m.created_at ASC`,
    [id]
  ).catch(() => ({ rows: [] }));

  return res.json({ ticket: rows[0], messages });
}));

ownerRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const restaurantId = await getRestaurantIdForUser(req.user);
  const id = Number(req.params.id);
  const { message } = req.body || {};

  const { rows: ticketRows } = await pool.query(
    `SELECT id FROM support_tickets
     WHERE id = $1 AND (created_by_user_id = $2 OR restaurant_id = $3) LIMIT 1`,
    [id, req.user.userId, restaurantId]
  );
  if (!ticketRows.length) return res.status(404).json({ message: 'Ticket not found' });
  if (!message || String(message).trim().length < 1) {
    return res.status(400).json({ message: 'message is required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, message)
     VALUES ($1, $2, 'owner', $3)
     RETURNING id, message, created_at`,
    [id, req.user.userId, String(message).trim()]
  );

  await pool.query(
    `UPDATE support_tickets SET status = 'waiting_customer', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );

  return res.status(201).json({ message: rows[0] });
}));

module.exports = { teamRouter, ownerRouter };
