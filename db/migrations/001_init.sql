-- Narzaalai MVP schema (SQLite). Money is stored as integer minor units with an explicit currency.
-- Currency exponents are defined in src/lib/domain/money.ts (MNT is treated as 0-decimal in practice).

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  service_area TEXT,
  offerings TEXT,                    -- free text: products and services
  supported_brands TEXT,
  installer_capability TEXT NOT NULL DEFAULT 'none'
    CHECK (installer_capability IN ('none','claimed','verified')),
  qualification_evidence TEXT,       -- must be filled before installer_capability = 'verified'
  warranty_terms TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  verification_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified','evidence_recorded')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  internal_notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (installer_capability <> 'verified' OR (qualification_evidence IS NOT NULL AND length(trim(qualification_evidence)) > 0))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','staff','admin','supplier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  supplier_id TEXT REFERENCES suppliers(id),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (role <> 'supplier' OR supplier_id IS NOT NULL)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL CHECK (organization_type IN ('household','business')),
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE org_members (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'owner' CHECK (member_role IN ('owner','member')),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_org_members_user ON org_members(user_id);

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  province TEXT NOT NULL,
  district TEXT,
  city TEXT,
  location_description TEXT,
  property_type TEXT NOT NULL,
  address TEXT,
  latitude REAL CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude REAL CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  ownership TEXT NOT NULL CHECK (ownership IN ('owner','controls','tenant','other')),
  install_area_note TEXT,
  install_area_m2 REAL CHECK (install_area_m2 IS NULL OR install_area_m2 > 0),
  shading_notes TEXT,
  site_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sites_org ON sites(org_id);

CREATE TABLE energy_profiles (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  usage_known INTEGER NOT NULL DEFAULT 1 CHECK (usage_known IN (0,1)),
  monthly_kwh REAL CHECK (monthly_kwh IS NULL OR monthly_kwh >= 0),
  bill_amount_minor INTEGER CHECK (bill_amount_minor IS NULL OR bill_amount_minor >= 0),
  bill_currency TEXT NOT NULL DEFAULT 'MNT',
  billing_period TEXT,
  utility_bill_note TEXT,
  major_loads TEXT,
  operating_hours TEXT,
  critical_loads TEXT,
  backup_needed TEXT NOT NULL DEFAULT 'unknown' CHECK (backup_needed IN ('yes','no','unknown')),
  existing_equipment TEXT,
  business_name TEXT,
  business_category TEXT,
  business_operating_hours TEXT,
  business_usage_pattern TEXT,
  business_seasonal_pattern TEXT,
  business_critical_equipment TEXT,
  additional_sites_note TEXT,
  objectives TEXT NOT NULL,          -- JSON array of objective keys
  budget_min_minor INTEGER CHECK (budget_min_minor IS NULL OR budget_min_minor >= 0),
  budget_max_minor INTEGER CHECK (budget_max_minor IS NULL OR budget_max_minor >= 0),
  budget_currency TEXT NOT NULL DEFAULT 'MNT',
  timeframe TEXT,
  provenance TEXT NOT NULL,          -- JSON: field -> customer_provided | unknown
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (budget_max_minor IS NULL OR budget_min_minor IS NULL OR budget_max_minor >= budget_min_minor)
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  site_id TEXT NOT NULL REFERENCES sites(id),
  energy_profile_id TEXT NOT NULL REFERENCES energy_profiles(id),
  verification_state TEXT NOT NULL DEFAULT 'preliminary'
    CHECK (verification_state IN ('preliminary','awaiting_verification','verified')),
  calc_version TEXT NOT NULL,
  input_snapshot TEXT NOT NULL,      -- JSON: exact inputs used for the calculation
  results TEXT NOT NULL,             -- JSON: calculation output
  assumptions TEXT NOT NULL,         -- JSON array
  missing_data TEXT NOT NULL,        -- JSON array of keys
  created_by TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_assessments_org ON assessments(org_id);
CREATE INDEX idx_assessments_assigned ON assessments(assigned_to);

CREATE TABLE assessment_notes (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
); -- internal only; never exposed to customers
CREATE INDEX idx_assessment_notes_assessment ON assessment_notes(assessment_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  site_id TEXT NOT NULL REFERENCES sites(id),
  assessment_id TEXT NOT NULL UNIQUE REFERENCES assessments(id),
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED','NEEDS_INFO','ASSESSMENT','QUOTE_REQUESTED','PROPOSAL_READY','APPROVED','PROCUREMENT',
    'INSTALL_SCHEDULED','INSTALLATION','COMMISSIONING','COMPLETED','IN_SERVICE',
    'MAINTENANCE','DELAYED','CANCELLED','REJECTED')),
  resume_status TEXT,                -- status to return to when DELAYED is lifted
  assigned_to TEXT REFERENCES users(id),
  scheduled_install_date TEXT,
  schedule_notes TEXT,
  blocked_reason TEXT,
  next_action_due TEXT,              -- ISO date; used to flag overdue items
  approved_proposal_id TEXT,
  financial_summary TEXT,            -- JSON, only populated from approved quotation data
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_status ON projects(status);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  supplier_id TEXT REFERENCES suppliers(id),
  quote_id TEXT,
  asset_id TEXT,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'site_photo','utility_bill','quotation','proposal','contract','delivery_note',
    'installation_evidence','commissioning_report','handover','warranty','other')),
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  uploaded_by TEXT REFERENCES users(id),
  access TEXT NOT NULL DEFAULT 'staff_only' CHECK (access IN ('staff_only','customer_visible')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (project_id IS NOT NULL OR supplier_id IS NOT NULL)
);
CREATE INDEX idx_documents_project ON documents(project_id);

CREATE TABLE project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'SUBMITTED','STATUS_CHANGE','NOTE','INFO_REQUESTED','INFO_PROVIDED','PROPOSAL_PUBLISHED',
    'PROPOSAL_APPROVED','MILESTONE','DOCUMENT','ASSIGNED')),
  previous_status TEXT,
  new_status TEXT,
  note TEXT,
  actor_id TEXT REFERENCES users(id),
  actor_label TEXT NOT NULL,         -- snapshot of who acted, e.g. "Staff: Name" or "Customer"
  document_id TEXT REFERENCES documents(id),
  customer_visible INTEGER NOT NULL DEFAULT 1 CHECK (customer_visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_project_events_project ON project_events(project_id, created_at);

CREATE TABLE info_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  response TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  answered_at TEXT
);
CREATE INDEX idx_info_requests_project ON info_requests(project_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  category TEXT NOT NULL CHECK (category IN (
    'pv_module','inverter','battery','mounting','charge_controller','cabling','monitoring','other')),
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  specs TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'MNT',
  compatibility TEXT,
  verification_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified','supplier_provided','independently_verified')),
  source TEXT,
  last_checked_on TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_products_supplier ON products(supplier_id);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  project_id TEXT REFERENCES projects(id),
  reference TEXT NOT NULL,
  quote_date TEXT NOT NULL,
  received_on TEXT,
  valid_until TEXT,
  currency TEXT NOT NULL,
  equipment_subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (equipment_subtotal_minor >= 0),
  installation_minor INTEGER NOT NULL DEFAULT 0 CHECK (installation_minor >= 0),
  delivery_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_minor >= 0),
  taxes_minor INTEGER NOT NULL DEFAULT 0 CHECK (taxes_minor >= 0),
  other_charges_minor INTEGER NOT NULL DEFAULT 0 CHECK (other_charges_minor >= 0),
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  exclusions TEXT,
  stock_status TEXT NOT NULL DEFAULT 'unknown' CHECK (stock_status IN ('in_stock','partial','on_order','unknown')),
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  installation_availability TEXT,
  warranty_terms TEXT,
  pv_kwp REAL CHECK (pv_kwp IS NULL OR pv_kwp > 0),
  battery_kwh REAL CHECK (battery_kwh IS NULL OR battery_kwh >= 0),
  inverter_kw REAL CHECK (inverter_kw IS NULL OR inverter_kw > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('supplier_quotation','indicative','demo')),
  source_note TEXT,
  document_id TEXT REFERENCES documents(id),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft','received','withdrawn')),
  archived_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (supplier_id, reference)
);
CREATE INDEX idx_quotes_project ON quotes(project_id);

CREATE TABLE quote_line_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'pv_module','inverter','battery','mounting','charge_controller','cabling','monitoring','other')),
  description TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  currency TEXT NOT NULL,
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_lines_quote ON quote_line_items(quote_id);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','approved','withdrawn')),
  approved_quote_id TEXT REFERENCES quotes(id),
  approved_by TEXT REFERENCES users(id),
  approved_by_label TEXT,
  approved_at TEXT,
  approval_note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status <> 'approved' OR (approved_quote_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX idx_proposals_project ON proposals(project_id);

CREATE TABLE proposal_options (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  label TEXT NOT NULL,
  customer_summary TEXT,             -- customer-visible explanation
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (proposal_id, quote_id)
);

CREATE TABLE installed_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  site_id TEXT NOT NULL REFERENCES sites(id),
  category TEXT NOT NULL CHECK (category IN (
    'pv_module','inverter','battery','mounting','charge_controller','cabling','monitoring','other')),
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT,                -- only ever entered from a real nameplate/document
  installation_date TEXT,
  installer_supplier_id TEXT REFERENCES suppliers(id),
  commissioning_state TEXT NOT NULL DEFAULT 'not_commissioned'
    CHECK (commissioning_state IN ('not_commissioned','commissioned','failed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_assets_project ON installed_assets(project_id);

CREATE TABLE warranty_records (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES installed_assets(id),
  provider TEXT NOT NULL,
  terms TEXT,
  start_date TEXT,
  end_date TEXT,
  document_id TEXT REFERENCES documents(id),
  verification_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified','evidence_recorded')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE service_tickets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  project_id TEXT REFERENCES projects(id),
  asset_id TEXT REFERENCES installed_assets(id),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Future monitoring boundary. Nothing writes here in the MVP unless explicitly marked simulated.
CREATE TABLE telemetry_points (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  asset_id TEXT REFERENCES installed_assets(id),
  source TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'unknown' CHECK (quality IN ('good','suspect','bad','unknown')),
  is_simulated INTEGER NOT NULL CHECK (is_simulated IN (0,1))
);
CREATE INDEX idx_telemetry_site_time ON telemetry_points(site_id, measured_at);

CREATE TABLE reference_counters (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL
);
