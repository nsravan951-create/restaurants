-- Full PostgreSQL setup for QR Restaurant SaaS
-- 1) Create database (run separately as superuser):
--    CREATE DATABASE qr_restaurant;
-- 2) Connect to qr_restaurant and run this file.

-- Run from psql connected to qr_restaurant:
-- \i schema.sql
-- \i sample_data.sql
-- Or from shell:
-- psql -d qr_restaurant -f database/schema.sql
-- psql -d qr_restaurant -f database/sample_data.sql

-- Demo login after seed:
-- Email: owner@demo.com
-- Password: password123
