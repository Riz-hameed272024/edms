-- EDMS PostgreSQL 16 schema (production data tier). Mirrors Phase 4 ER model.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN','COORDINATOR','RESCUE','MEDICAL','VOLUNTEER','PUBLIC');
CREATE TYPE priority AS ENUM ('P1','P2','P3','P4');

CREATE TABLE app_user (
  user_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  phone          text UNIQUE,
  email          text UNIQUE,
  password_hash  text NOT NULL,
  role           user_role NOT NULL,
  mfa_secret_enc bytea,
  status         text NOT NULL DEFAULT 'ACTIVE',
  failed_logins  int NOT NULL DEFAULT 0,
  token_version  int NOT NULL DEFAULT 0
);

CREATE TABLE incident (
  incident_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    uuid REFERENCES app_user(user_id),
  type           text NOT NULL,
  description    text NOT NULL CHECK (length(description) BETWEEN 5 AND 500),
  location_enc   bytea NOT NULL,                 -- pgp_sym_encrypt(lat,lon) with key from Secret
  geohash_coarse text NOT NULL,                  -- ~1 km, safe for low-trust viewers
  priority       priority,
  status         text NOT NULL DEFAULT 'REPORTED',
  verified_by    uuid REFERENCES app_user(user_id),
  version        int NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE priority_change (
  change_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incident(incident_id),
  old_priority priority,
  new_priority priority NOT NULL,
  requested_by uuid NOT NULL REFERENCES app_user(user_id),
  approved_by  uuid REFERENCES app_user(user_id),
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'PENDING',
  CONSTRAINT sod_priority CHECK (approved_by IS NULL OR approved_by <> requested_by)   -- SR-05
);

CREATE TABLE resource (
  resource_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  unit          text NOT NULL,
  qty_available int NOT NULL CHECK (qty_available >= 0),
  warehouse     text NOT NULL
);

CREATE TABLE shelter (
  shelter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, address text NOT NULL,
  capacity int NOT NULL CHECK (capacity > 0),
  occupancy int NOT NULL DEFAULT 0 CHECK (occupancy >= 0),
  status text NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE allocation (
  allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id   uuid NOT NULL REFERENCES resource(resource_id),
  incident_id   uuid REFERENCES incident(incident_id),
  shelter_id    uuid REFERENCES shelter(shelter_id),
  quantity      int NOT NULL CHECK (quantity > 0),
  requested_by  uuid NOT NULL REFERENCES app_user(user_id),
  approved_by   uuid REFERENCES app_user(user_id),
  status        text NOT NULL DEFAULT 'REQUESTED',
  CONSTRAINT one_target CHECK ((incident_id IS NULL) <> (shelter_id IS NULL)),
  CONSTRAINT sod_allocation CHECK (approved_by IS NULL OR approved_by <> requested_by)  -- SR-04
);

CREATE TABLE audit_log (
  log_id    bigserial PRIMARY KEY,
  actor_id  text NOT NULL,
  action    text NOT NULL,
  entity_id text NOT NULL,
  data      jsonb,
  ts        timestamptz NOT NULL DEFAULT now(),
  prev_hash char(64) NOT NULL,
  hash      char(64) NOT NULL
);

-- Least-privilege DB roles (V-08): the app can only INSERT/SELECT audit rows.
CREATE ROLE edms_app LOGIN;
GRANT SELECT, INSERT, UPDATE ON app_user, incident, priority_change, resource, shelter, allocation TO edms_app;
GRANT SELECT, INSERT ON audit_log TO edms_app;
GRANT USAGE ON SEQUENCE audit_log_log_id_seq TO edms_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM edms_app;
