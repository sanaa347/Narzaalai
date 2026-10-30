-- A status-change event is visible to the customer, but its staff note stays internal unless explicitly shared.
ALTER TABLE project_events ADD COLUMN note_customer_visible INTEGER NOT NULL DEFAULT 0 CHECK (note_customer_visible IN (0,1));
CREATE INDEX idx_documents_quote ON documents(quote_id);
CREATE INDEX idx_documents_supplier ON documents(supplier_id);
CREATE INDEX idx_quotes_supplier ON quotes(supplier_id);
CREATE INDEX idx_tickets_site ON service_tickets(site_id);
