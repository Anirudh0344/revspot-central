export type Health = 'red' | 'amber' | 'green';
export type DealCategory = 'pilot' | 'retention' | 'expansion';

export const SC_FIELDS = [
  { key: 'sc_business_outcome', label: 'Business outcome', hint: 'What changes for the client' },
  { key: 'sc_targets', label: 'Targets', hint: 'The numbers that count' },
  { key: 'sc_leading_indicators', label: 'Leading indicators', hint: 'What we watch weekly' },
  { key: 'sc_judged_by', label: 'Judged by', hint: 'Who decides, by name and title' },
  { key: 'sc_failure_line', label: 'Failure line', hint: 'Below this, the pilot failed' },
  { key: 'sc_decision_statement', label: 'Decision statement', hint: 'What happens at the readout' },
] as const;

export type DealRow = {
  id: string;
  code: string | null;
  client_id: string;
  client_name: string;
  title: string;
  product: string | null;
  projects: string[] | null;
  category: DealCategory;
  stage: string;
  stage_label: string;
  stage_position: number;
  stage_max_days: number | null;
  stage_is_terminal: boolean;
  exit_requirements: string[];
  parent_deal_id: string | null;
  health: Health | null;
  health_reason: string | null;
  health_updated_at: string | null;
  health_stale: boolean;
  criteria_complete: boolean;
  commercial_model: string | null;
  term_months: number | null;
  monthly_value: string | null;
  contract_value: string | null;
  start_date: string | null;
  end_date: string | null;
  next_step: string | null;
  next_step_due: string | null;
  next_step_overdue: boolean;
  intern_owner: string | null;
  intern_owner_name: string | null;
  context_doc_url: string | null;
  close_reason: string | null;
  days_in_stage: number;
  stage_flag: 'ok' | 'amber' | 'red';
  total_value: string | null;
  delivered_value: string | null;
  delivery_progress: string | null;
  checkin_due_at: string | null;
  last_client_interaction_at: string | null;
  archived_at: string | null;
  sc_business_outcome: string | null;
  sc_targets: string | null;
  sc_leading_indicators: string | null;
  sc_judged_by: string | null;
  sc_failure_line: string | null;
  sc_decision_statement: string | null;
};

export type ClientRow = {
  id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  segment: string | null;
  city: string | null;
  status: string;
  health: Health | null;
  open_deals: string | null;
  open_pilots: string | null;
  open_retention: string | null;
  open_expansion: string | null;
  monthly_value: string | null;
  intern_owner: string | null;
  intern_owner_name: string | null;
  single_threaded: boolean;
  contact_count: string | null;
  last_interaction_at: string | null;
  whitespace_notes: string | null;
  archived_at: string | null;
};
