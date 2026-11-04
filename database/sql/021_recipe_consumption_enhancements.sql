BEGIN;

CREATE INDEX IF NOT EXISTS idx_recipes_restaurant
  ON recipes (restaurant_id, menu_item_id);

CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient
  ON recipe_items (ingredient_id, recipe_id);

INSERT INTO schema_migrations (version)
VALUES ('021_recipe_consumption_enhancements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
