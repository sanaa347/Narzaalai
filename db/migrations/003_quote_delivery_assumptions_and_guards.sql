-- 003: record what a quotation's delivery price/lead time ASSUMES, and add database-level guards for quotation integrity.
--
-- Reversible: `ALTER TABLE quotes DROP COLUMN delivery_assumptions` (SQLite >= 3.35) and
-- `DROP TRIGGER` for each trigger below undo this migration without touching any other data.

ALTER TABLE quotes ADD COLUMN delivery_assumptions TEXT;   -- e.g. "delivered to Ulaanbaatar warehouse, unloading by customer"

-- Defence in depth: the service layer already validates these, but a direct SQL write (script, future service, import)
-- must not be able to store an unknown currency or a "real" supplier quotation without evidence of how it was received.
CREATE TRIGGER trg_quotes_currency_insert BEFORE INSERT ON quotes
WHEN NEW.currency NOT IN ('MNT','USD','CNY','EUR','KRW')
BEGIN SELECT RAISE(ABORT, 'quotes.currency must be one of MNT, USD, CNY, EUR, KRW'); END;

CREATE TRIGGER trg_quotes_currency_update BEFORE UPDATE OF currency ON quotes
WHEN NEW.currency NOT IN ('MNT','USD','CNY','EUR','KRW')
BEGIN SELECT RAISE(ABORT, 'quotes.currency must be one of MNT, USD, CNY, EUR, KRW'); END;

CREATE TRIGGER trg_quotes_evidence_insert BEFORE INSERT ON quotes
WHEN NEW.source_type = 'supplier_quotation'
 AND (NEW.received_on IS NULL OR NEW.source_note IS NULL OR length(trim(NEW.source_note)) = 0)
BEGIN SELECT RAISE(ABORT, 'a supplier quotation needs received_on and source_note'); END;

CREATE TRIGGER trg_quotes_evidence_update BEFORE UPDATE OF source_type, received_on, source_note ON quotes
WHEN NEW.source_type = 'supplier_quotation'
 AND (NEW.received_on IS NULL OR NEW.source_note IS NULL OR length(trim(NEW.source_note)) = 0)
BEGIN SELECT RAISE(ABORT, 'a supplier quotation needs received_on and source_note'); END;

-- A line item must be priced in the same currency as its quotation (no silent mixing).
CREATE TRIGGER trg_quote_lines_currency BEFORE INSERT ON quote_line_items
WHEN NEW.currency <> (SELECT currency FROM quotes WHERE id = NEW.quote_id)
BEGIN SELECT RAISE(ABORT, 'quote line currency must equal the quotation currency'); END;
