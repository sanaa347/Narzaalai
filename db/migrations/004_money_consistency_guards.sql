-- 004: database-level money consistency guards (defence in depth; the service layer already computes these correctly).
--
-- Found by audit: the guards from 003 stopped an unknown currency and a mismatched line on INSERT, but a direct SQL write
-- (script, import, future service, Postgres-port bug) could still
--   * change a quotation's currency while its lines stayed in the old one,
--   * change one line's currency on its own,
--   * store a line total that is not quantity x unit price,
--   * store a quotation total that is not the sum of its parts.
-- Each of those silently produces wrong money, so each is now refused. The service writes consistent values and (since this
-- migration) deletes a quotation's old lines BEFORE changing its currency, so legitimate edits are unaffected.
--
-- Existing rows are not rewritten or re-validated; the triggers only act on future writes.
--
-- Reversible, touching no data:
--   DROP TRIGGER trg_quotes_currency_vs_lines;  DROP TRIGGER trg_quote_lines_currency_update;
--   DROP TRIGGER trg_quote_lines_total_insert;  DROP TRIGGER trg_quote_lines_total_update;
--   DROP TRIGGER trg_quotes_total_insert;       DROP TRIGGER trg_quotes_total_update;
--   DELETE FROM schema_migrations WHERE name = '004_money_consistency_guards.sql';

CREATE TRIGGER trg_quotes_currency_vs_lines BEFORE UPDATE OF currency ON quotes
WHEN EXISTS (SELECT 1 FROM quote_line_items WHERE quote_id = NEW.id AND currency <> NEW.currency)
BEGIN SELECT RAISE(ABORT, 'cannot change a quotation currency while its line items are priced in another currency'); END;

CREATE TRIGGER trg_quote_lines_currency_update BEFORE UPDATE OF currency, quote_id ON quote_line_items
WHEN NEW.currency <> (SELECT currency FROM quotes WHERE id = NEW.quote_id)
BEGIN SELECT RAISE(ABORT, 'quote line currency must equal the quotation currency'); END;

CREATE TRIGGER trg_quote_lines_total_insert BEFORE INSERT ON quote_line_items
WHEN NEW.line_total_minor <> NEW.quantity * NEW.unit_price_minor
BEGIN SELECT RAISE(ABORT, 'line_total_minor must equal quantity x unit_price_minor'); END;

CREATE TRIGGER trg_quote_lines_total_update BEFORE UPDATE OF quantity, unit_price_minor, line_total_minor ON quote_line_items
WHEN NEW.line_total_minor <> NEW.quantity * NEW.unit_price_minor
BEGIN SELECT RAISE(ABORT, 'line_total_minor must equal quantity x unit_price_minor'); END;

CREATE TRIGGER trg_quotes_total_insert BEFORE INSERT ON quotes
WHEN NEW.total_minor <> NEW.equipment_subtotal_minor + NEW.installation_minor + NEW.delivery_minor + NEW.taxes_minor + NEW.other_charges_minor
BEGIN SELECT RAISE(ABORT, 'total_minor must equal subtotal + installation + delivery + taxes + other charges'); END;

CREATE TRIGGER trg_quotes_total_update BEFORE UPDATE OF equipment_subtotal_minor, installation_minor, delivery_minor, taxes_minor, other_charges_minor, total_minor ON quotes
WHEN NEW.total_minor <> NEW.equipment_subtotal_minor + NEW.installation_minor + NEW.delivery_minor + NEW.taxes_minor + NEW.other_charges_minor
BEGIN SELECT RAISE(ABORT, 'total_minor must equal subtotal + installation + delivery + taxes + other charges'); END;
