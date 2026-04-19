-- PostgreSQL seed data for qr_restaurant.

-- Replace password_hash with a bcrypt hash generated for your preferred demo password.
WITH new_user AS (
	INSERT INTO users (name, email, password_hash, role)
	VALUES ('Demo Owner', 'owner@demo.com', '$2b$10$e0NRMxr5W4P4MlbVxQz1E.7a4fXn7Y4XQXJo4PQ4vYQ0c5hV0s5ri', 'owner')
	RETURNING id
), new_restaurant AS (
	INSERT INTO restaurants (owner_user_id, name, slug, phone, address)
	SELECT id, 'Sunrise Diner', 'sunrise-diner-demo', '+91-9999999999', 'MG Road, Bengaluru'
	FROM new_user
	RETURNING id
)
UPDATE users
SET restaurant_id = (SELECT id FROM new_restaurant)
WHERE email = 'owner@demo.com';

INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token)
VALUES
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'T1', 'sunrise-diner-demo-T1'),
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'T2', 'sunrise-diner-demo-T2'),
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'T3', 'sunrise-diner-demo-T3');

INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
SELECT r.id,
			 rt.id,
			 'http://localhost:3000/restaurant/' || r.id || '/table/' || rt.id,
			 'data:image/png;base64,'
FROM restaurant_tables rt
JOIN restaurants r ON r.id = rt.restaurant_id
WHERE r.slug = 'sunrise-diner-demo';

INSERT INTO menu_items (restaurant_id, name, description, price, image_url, category, is_available)
VALUES
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'Margherita Pizza', 'Classic cheese pizza', 249.00, 'https://images.unsplash.com/photo-1601924638867-3ec2b0d6f490', 'Pizza', TRUE),
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'Veg Burger', 'Loaded with fresh veggies', 149.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd', 'Burgers', TRUE),
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'Cold Coffee', 'Chilled coffee with cream', 99.00, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085', 'Beverages', TRUE),
((SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), 'Vanilla Ice Cream', 'Scoop of vanilla delight', 79.00, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb', 'Desserts', TRUE);

INSERT INTO ads (title, image_url, target_link, restaurant_id, is_active)
VALUES
('Buy 1 Get 1 Ice Cream', 'https://images.unsplash.com/photo-1570197788417-0e82375c9371', 'https://example.com/ice-cream-offer', (SELECT id FROM restaurants WHERE slug = 'sunrise-diner-demo'), TRUE),
('Local Real Estate Expo', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa', 'https://example.com/real-estate', NULL, TRUE);
