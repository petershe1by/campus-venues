CREATE TABLE IF NOT EXISTS campus_venues_state (
  id integer PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL
);
INSERT INTO campus_venues_state (id, data)
VALUES (1, '{"version":1,"users":[],"sessions":[],"bookings":[],"audit":[],"attempts":[]}'::jsonb)
ON CONFLICT DO NOTHING;
