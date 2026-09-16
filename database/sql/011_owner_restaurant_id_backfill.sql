-- Backfill users.restaurant_id for owner accounts created before registration set it.
UPDATE users u
SET restaurant_id = r.id
FROM restaurants r
WHERE r.owner_user_id = u.id
  AND u.role = 'owner'
  AND u.restaurant_id IS NULL;
