-- 015: Complete platform role catalog + permission mappings

BEGIN;

INSERT INTO platform_roles (role_key, name, description, department_id, is_system, status)
SELECT v.role_key, v.name, v.description, d.id, TRUE, 'active'
FROM (VALUES
  ('settlement_manager', 'Settlement Manager', 'Restaurant settlement batches and payout tracking'),
  ('subscription_manager', 'Subscription Manager', 'SaaS plans and restaurant subscriptions'),
  ('registration_manager', 'Registration Manager', 'Onboard new restaurants and owner accounts'),
  ('operations_manager', 'Operations Manager', 'Live orders and restaurant operations'),
  ('ads_manager', 'Ads Manager', 'Promotions, banners, and ad campaigns'),
  ('support_manager', 'Support Manager', 'Support ticket queue and resolutions')
) AS v(role_key, name, description)
LEFT JOIN departments d ON d.name = CASE v.role_key
  WHEN 'settlement_manager' THEN 'Finance'
  WHEN 'subscription_manager' THEN 'Finance'
  WHEN 'registration_manager' THEN 'Operations'
  WHEN 'operations_manager' THEN 'Operations'
  WHEN 'ads_manager' THEN 'Marketing'
  WHEN 'support_manager' THEN 'Support'
  ELSE 'Operations'
END
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  department_id = EXCLUDED.department_id,
  status = 'active';

-- Ensure features_manager exists (from 013)
INSERT INTO platform_roles (role_key, name, description, department_id, is_system, status)
SELECT 'features_manager', 'Features Manager', 'Enable features after verified upgrade payments',
       d.id, TRUE, 'active'
FROM departments d WHERE d.name = 'Operations'
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO platform_permissions (permission_key, name, description, category) VALUES
  ('messaging.read', 'View messages', 'Read broadcast messages', 'messaging'),
  ('messaging.manage', 'Manage messages', 'Send broadcast messages to owners', 'messaging')
ON CONFLICT (permission_key) DO NOTHING;

-- === Finance ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('finance_manager', 'restaurants.read'),
  ('finance_manager', 'payments.read'),
  ('finance_manager', 'finance.read'),
  ('finance_manager', 'finance.write'),
  ('finance_manager', 'analytics.read'),
  ('finance_manager', 'audit.read'),
  ('finance_manager', 'data.export'),
  ('finance_manager', 'orders.export'),
  ('finance_manager', 'orders.view'),
  ('payment_manager', 'bank_details.view'),
  ('payment_manager', 'bank_details.manage'),
  ('payment_manager', 'data.export'),
  ('payment_manager', 'upgrades.view'),
  ('settlement_manager', 'settlements.view'),
  ('settlement_manager', 'settlements.manage'),
  ('settlement_manager', 'finance.read'),
  ('settlement_manager', 'bank_details.view'),
  ('settlement_manager', 'restaurants.read'),
  ('settlement_manager', 'payments.read'),
  ('settlement_manager', 'audit.read'),
  ('settlement_manager', 'data.export'),
  ('subscription_manager', 'subscriptions.view'),
  ('subscription_manager', 'subscriptions.manage'),
  ('subscription_manager', 'upgrades.view'),
  ('subscription_manager', 'features.view'),
  ('subscription_manager', 'restaurants.read'),
  ('subscription_manager', 'analytics.read'),
  ('subscription_manager', 'audit.read')
ON CONFLICT DO NOTHING;

-- === Operations ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('restaurant_manager', 'restaurants.read'),
  ('restaurant_manager', 'restaurants.write'),
  ('restaurant_manager', 'analytics.read'),
  ('restaurant_manager', 'orders.view'),
  ('restaurant_manager', 'support.view'),
  ('restaurant_manager', 'search.global'),
  ('registration_manager', 'restaurants.read'),
  ('registration_manager', 'restaurants.create'),
  ('registration_manager', 'restaurants.write'),
  ('registration_manager', 'subscriptions.view'),
  ('registration_manager', 'analytics.read'),
  ('registration_manager', 'audit.read'),
  ('operations_manager', 'restaurants.read'),
  ('operations_manager', 'orders.view'),
  ('operations_manager', 'analytics.read'),
  ('operations_manager', 'search.global'),
  ('features_manager', 'analytics.read')
ON CONFLICT DO NOTHING;

-- === Marketing ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('ads_manager', 'promotions.read'),
  ('ads_manager', 'promotions.write'),
  ('ads_manager', 'restaurants.read'),
  ('ads_manager', 'analytics.read'),
  ('ads_manager', 'messaging.read'),
  ('promotions_manager', 'promotions.read'),
  ('promotions_manager', 'promotions.write'),
  ('promotions_manager', 'restaurants.read'),
  ('promotions_manager', 'analytics.read'),
  ('promotions_manager', 'messaging.read')
ON CONFLICT DO NOTHING;

-- === Analytics ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('analytics_manager', 'analytics.read'),
  ('analytics_manager', 'restaurants.read'),
  ('analytics_manager', 'orders.view'),
  ('analytics_manager', 'data.export'),
  ('analytics_manager', 'orders.export'),
  ('analytics_manager', 'search.global')
ON CONFLICT DO NOTHING;

-- === Support ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('support_manager', 'support.view'),
  ('support_manager', 'support.manage'),
  ('support_manager', 'support.respond'),
  ('support_manager', 'restaurants.read'),
  ('support_manager', 'orders.view'),
  ('support_manager', 'analytics.read'),
  ('support_manager', 'audit.read'),
  ('user_enquiry_manager', 'support.view'),
  ('user_enquiry_manager', 'support.manage'),
  ('user_enquiry_manager', 'support.respond'),
  ('user_enquiry_manager', 'restaurants.read'),
  ('user_enquiry_manager', 'messaging.read')
ON CONFLICT DO NOTHING;

-- === Technology ===
INSERT INTO platform_role_permissions (role, permission_key) VALUES
  ('database_manager', 'audit.read'),
  ('database_manager', 'search.global'),
  ('backend_manager', 'audit.read'),
  ('backend_manager', 'search.global')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('015_platform_roles_catalog')
ON CONFLICT (version) DO NOTHING;

COMMIT;
