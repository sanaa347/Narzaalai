import type { ProjectStatus } from "@/lib/domain/status";
import type { Currency } from "@/lib/domain/money";
import type { SourceType } from "@/lib/domain/quote";

export type Bool = 0 | 1;

export interface UserRow {
  id: string; full_name: string; email: string; phone: string | null; role: "customer" | "staff" | "admin" | "supplier";
  status: "active" | "disabled"; supplier_id: string | null; is_demo: Bool; created_at: string; updated_at: string;
}
export interface OrgRow {
  id: string; name: string; organization_type: "household" | "business"; contact_name: string | null;
  contact_phone: string | null; contact_email: string | null; is_demo: Bool; created_at: string; updated_at: string;
}
export interface SiteRow {
  id: string; org_id: string; province: string; district: string | null; city: string | null; location_description: string | null;
  property_type: string; address: string | null; latitude: number | null; longitude: number | null;
  ownership: "owner" | "controls" | "tenant" | "other"; install_area_note: string | null; install_area_m2: number | null;
  shading_notes: string | null; site_notes: string | null; created_at: string; updated_at: string;
}
export interface EnergyProfileRow {
  id: string; site_id: string; usage_known: Bool; monthly_kwh: number | null; bill_amount_minor: number | null; bill_currency: string;
  billing_period: string | null; utility_bill_note: string | null; major_loads: string | null; operating_hours: string | null;
  critical_loads: string | null; backup_needed: "yes" | "no" | "unknown"; existing_equipment: string | null;
  business_name: string | null; business_category: string | null; business_operating_hours: string | null;
  business_usage_pattern: string | null; business_seasonal_pattern: string | null; business_critical_equipment: string | null;
  additional_sites_note: string | null; objectives: string; budget_min_minor: number | null; budget_max_minor: number | null;
  budget_currency: string; timeframe: string | null; provenance: string; created_at: string; updated_at: string;
}
export interface AssessmentRow {
  id: string; reference: string; org_id: string; site_id: string; energy_profile_id: string;
  verification_state: "preliminary" | "awaiting_verification" | "verified"; calc_version: string; input_snapshot: string;
  results: string; assumptions: string; missing_data: string; created_by: string | null; assigned_to: string | null;
  created_at: string; updated_at: string;
}
export interface ProjectRow {
  id: string; reference: string; org_id: string; site_id: string; assessment_id: string; status: ProjectStatus;
  resume_status: ProjectStatus | null; assigned_to: string | null; scheduled_install_date: string | null; schedule_notes: string | null;
  blocked_reason: string | null; next_action_due: string | null; approved_proposal_id: string | null; financial_summary: string | null;
  is_demo: Bool; created_at: string; updated_at: string;
}
export interface EventRow {
  id: string; project_id: string; event_type: string; previous_status: ProjectStatus | null; new_status: ProjectStatus | null;
  note: string | null; actor_id: string | null; actor_label: string; document_id: string | null; customer_visible: Bool;
  note_customer_visible: Bool; created_at: string;
}
export interface InfoRequestRow {
  id: string; project_id: string; message: string; status: "open" | "answered" | "closed"; response: string | null;
  requested_by: string; created_at: string; answered_at: string | null;
}
export interface DocumentRow {
  id: string; project_id: string | null; supplier_id: string | null; quote_id: string | null; asset_id: string | null; doc_type: string;
  original_name: string; storage_path: string; mime_type: string; size_bytes: number; uploaded_by: string | null;
  access: "staff_only" | "customer_visible"; created_at: string;
}
export interface SupplierRow {
  id: string; company_name: string; contact_name: string | null; phone: string | null; email: string | null; service_area: string | null;
  offerings: string | null; supported_brands: string | null; installer_capability: "none" | "claimed" | "verified";
  qualification_evidence: string | null; warranty_terms: string | null; status: "active" | "inactive";
  verification_state: "unverified" | "evidence_recorded"; is_demo: Bool; internal_notes: string | null; archived_at: string | null;
  created_at: string; updated_at: string;
}
export type ProductCategory = "pv_module" | "inverter" | "battery" | "mounting" | "charge_controller" | "cabling" | "monitoring" | "other";
export interface ProductRow {
  id: string; supplier_id: string | null; category: ProductCategory; manufacturer: string; model: string; specs: string | null;
  price_minor: number | null; currency: Currency; compatibility: string | null;
  verification_state: "unverified" | "supplier_provided" | "independently_verified"; source: string | null; last_checked_on: string | null;
  is_demo: Bool; archived_at: string | null; created_at: string; updated_at: string;
}
export interface QuoteRow {
  id: string; supplier_id: string; project_id: string | null; reference: string; quote_date: string; received_on: string | null;
  valid_until: string | null; currency: Currency; equipment_subtotal_minor: number; installation_minor: number; delivery_minor: number;
  taxes_minor: number; other_charges_minor: number; total_minor: number; exclusions: string | null;
  stock_status: "in_stock" | "partial" | "on_order" | "unknown"; lead_time_days: number | null; installation_availability: string | null;
  delivery_assumptions: string | null; warranty_terms: string | null; pv_kwp: number | null; battery_kwh: number | null; inverter_kw: number | null;
  source_type: SourceType; source_note: string | null; document_id: string | null; status: "draft" | "received" | "withdrawn";
  archived_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface QuoteLineRow {
  id: string; quote_id: string; product_id: string | null; category: ProductCategory; description: string; manufacturer: string | null;
  model: string | null; quantity: number; unit_price_minor: number; currency: Currency; line_total_minor: number; notes: string | null;
  position: number;
}
export interface ProposalRow {
  id: string; project_id: string; title: string; summary: string | null; status: "draft" | "published" | "approved" | "withdrawn";
  approved_quote_id: string | null; approved_by: string | null; approved_by_label: string | null; approved_at: string | null;
  approval_note: string | null; created_by: string; published_at: string | null; created_at: string; updated_at: string;
}
export interface ProposalOptionRow {
  id: string; proposal_id: string; quote_id: string; label: string; customer_summary: string | null; position: number;
}
export interface AssetRow {
  id: string; project_id: string; site_id: string; category: ProductCategory; manufacturer: string; model: string;
  serial_number: string | null; installation_date: string | null; installer_supplier_id: string | null;
  commissioning_state: "not_commissioned" | "commissioned" | "failed"; notes: string | null; created_at: string;
}
export interface WarrantyRow {
  id: string; asset_id: string; provider: string; terms: string | null; start_date: string | null; end_date: string | null;
  document_id: string | null; verification_state: "unverified" | "evidence_recorded"; created_at: string;
}
export interface TicketRow {
  id: string; site_id: string; project_id: string | null; asset_id: string | null; description: string;
  priority: "low" | "normal" | "high" | "urgent"; status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface NoteRow { id: string; assessment_id: string; author_id: string; body: string; created_at: string }
