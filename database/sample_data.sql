USE qr_restaurant;

-- Replace password_hash with a bcrypt hash generated for your preferred demo password.
INSERT INTO users (name, email, password_hash, role)
VALUES ('Demo Owner', 'owner@demo.com', '$2b$10$e0NRMxr5W4P4MlbVxQz1E.7a4fXn7Y4XQXJo4PQ4vYQ0c5hV0s5ri', 'owner');

INSERT INTO restaurants (owner_user_id, name, slug, phone, address)
VALUES (LAST_INSERT_ID(), 'Sunrise Diner', 'sunrise-diner-demo', '+91-9999999999', 'MG Road, Bengaluru');

SET @restaurant_id = LAST_INSERT_ID();

UPDATE users SET restaurant_id = @restaurant_id WHERE email = 'owner@demo.com';

INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token)
VALUES
(@restaurant_id, 'T1', CONCAT(@restaurant_id, '-T1-demo')),
(@restaurant_id, 'T2', CONCAT(@restaurant_id, '-T2-demo')),
(@restaurant_id, 'T3', CONCAT(@restaurant_id, '-T3-demo'));

INSERT INTO qr_codes (restaurant_id, table_id, qr_url, qr_data_url)
SELECT @restaurant_id,
	   rt.id,
	   CONCAT('http://localhost:3000/restaurant/', @restaurant_id, '/table/', rt.id),
	   'data:image/png;base64,'
FROM restaurant_tables rt
WHERE rt.restaurant_id = @restaurant_id;

INSERT INTO menu_items (restaurant_id, name, description, price, image_url, category, is_available)
VALUES
(@restaurant_id, 'Margherita Pizza', 'Classic cheese pizza', 249.00, 'https://images.unsplash.com/photo-1601924638867-3ec2b0d6f490', 'Pizza', 1),
(@restaurant_id, 'Veg Burger', 'Loaded with fresh veggies', 149.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd', 'Burgers', 1),
(@restaurant_id, 'Cold Coffee', 'Chilled coffee with cream', 99.00, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085', 'Beverages', 1),
(@restaurant_id, 'Vanilla Ice Cream', 'Scoop of vanilla delight', 79.00, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb', 'Desserts', 1);

INSERT INTO ads (title, image_url, target_link, restaurant_id, is_active)
VALUES
('Buy 1 Get 1 Ice Cream', 'https://images.unsplash.com/photo-1570197788417-0e82375c9371', 'https://example.com/ice-cream-offer', @restaurant_id, 1),
('Local Real Estate Expo', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa', 'https://example.com/real-estate', NULL, 1);
