export type Locale = "en" | "ko" | "ja" | "de" | "es";
export type ActiveLocale = "en" | "ko";
export type Vertical = "wattcheck" | "puregram" | "cyclegear" | "hometech";
export type AvailabilityStatus =
  | "IN_STOCK"
  | "OUT_OF_STOCK_TEMP"
  | "DISCONTINUED_OR_404"
  | "PRICE_STALE";

export interface Citation {
  label: string;
  url: string;
  source_tier: 1 | 2 | 3;
  verified_at: string;
}

export interface RegionalOffer {
  asin?: string | null;
  sku?: string | null;
  msrp: number;
  currency: "USD" | "KRW" | "JPY" | "EUR" | "GBP";
  price_mode: "msrp_benchmark_mode";
  price_checked_at: string;
  search_query: string;
  status: AvailabilityStatus;
}

export interface LocaleCopy {
  name: string;
  title: string;
  summary: string;
  best_for: string;
  local_gotchas: string[];
}

export interface AuditMeta {
  fact_checked_at: string;
  adversarial_pass: true;
  trust_score: number;
  info_gain_score: number;
  human_spot_checked: boolean;
}

export interface BaseItem {
  schema_version: "2.0.0";
  vertical: Vertical;
  slug: string;
  release_wave: number;
  available_locales: Locale[];
  brand: string;
  model_number: string;
  origin_country: string;
  regional_offers: {
    us: RegionalOffer;
    kr: RegionalOffer;
    jp?: RegionalOffer;
    de?: RegionalOffer;
    es?: RegionalOffer;
  };
  i18n: {
    en: LocaleCopy;
    ko: LocaleCopy;
    ja?: LocaleCopy;
    de?: LocaleCopy;
    es?: LocaleCopy;
  };
  citations: Citation[];
  audit: AuditMeta;
  successor_slug?: string | null;
  auto_fallback_slugs?: string[];
}

export interface PortDef {
  id: string;
  type: "USB-C" | "USB-A" | "AC" | "DC" | "Car-12V";
  max_w: number;
  protocols: string[];
}

export interface PortAllocation {
  active_ports: string[];
  output_w: Record<string, number>;
}

export interface WattCheckItem extends BaseItem {
  vertical: "wattcheck";
  category: "power-bank" | "gan-charger" | "power-station";
  specs: {
    has_battery: boolean;
    nominal_capacity_mah: number | null;
    rated_capacity_mah_5v: number | null;
    battery_energy_wh: number | null;
    nominal_voltage_v: number | null;
    cell_chemistry: string | null;
    conversion_efficiency_pct: number | null;
    wh_printed_on_body: boolean | null;
    input_voltage_range: string;
    japan_100v_output_limit_w: number | null;
    ul_etl_certified: boolean;
    ce_certified: boolean;
    ccc_certified: boolean;
    pse_certified: boolean;
    kc_certified: boolean;
    weight_g: number;
    dimensions_mm: { l: number; w: number; h: number };
    max_total_output_w: number;
    max_single_port_output_w: number;
    max_input_w: number;
    supports_pd_3_1_epr: boolean;
    supports_samsung_pps_45w: boolean;
    supports_pass_through: boolean;
    power_renegotiation_drop: boolean;
    ports: PortDef[];
    port_allocation_matrix: PortAllocation[];
  };
  airline_compliance_profile: {
    iata_tier:
      | "no_battery_always_allowed"
      | "under_100wh_no_approval"
      | "100_to_160wh_approval_required"
      | "over_160wh_prohibited";
    carryon_allowed: boolean;
    carryon_no_approval: boolean;
    checked_baggage: "allowed" | "prohibited";
    korea_molit_2026_notes: string;
    china_domestic_ccc_ok: boolean;
  };
}

export interface AirlineRecord {
  slug: string;
  iata_code: string;
  region: "KR" | "NA" | "EU" | "APAC" | "ME";
  name_en: string;
  name_ko: string;
  under_100wh_max_pcs: number;
  between_100_160wh_max_pcs: number;
  between_100_160wh_requires_approval: boolean;
  over_160wh_allowed: false;
  overhead_bin_prohibited: boolean;
  inflight_charging_prohibited: boolean;
  terminal_insulation_pouch_required: boolean;
  wh_marking_strict: boolean;
  ccc_marking_required_domestic: boolean;
  notes_en: string;
  notes_ko: string;
  official_policy_url: string;
  verified_at: string;
}

export interface PureGramItem extends BaseItem {
  vertical: "puregram";
  category: "energy-gel" | "electrolyte" | "creatine" | "carb-mix";
  package_spec: {
    net_weight_g: number;
    total_servings: number;
    serving_weight_g: number;
    unit_type: "packet" | "scoop" | "tablet" | "pouch";
    flavors_tracked: string[];
  };
  nutrition_label: {
    calories_kcal: number;
    active_ingredient_type:
      | "carbohydrates"
      | "creatine_monohydrate"
      | "electrolytes_sodium_potassium";
    active_per_serving_g: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    sugar_g: number;
    fiber_g: number;
    carb_ratio_glucose_to_fructose: string | null;
    caffeine_mg: number;
    sodium_mg: number;
    potassium_mg: number;
    magnesium_mg: number;
    creapure_certified: boolean;
    hydrogel_or_isotonic: "hydrogel" | "isotonic" | "standard" | "none";
    free_form_amino_listed: boolean;
    artificial_sweeteners_listed: boolean;
    sweetener_details: string;
  };
  derived_math: {
    purity_pct: number;
    total_pure_active_g: number;
    benchmark_unit_g: number;
    benchmark_label_en: string;
    benchmark_label_ko: string;
    servings_for_90g_per_hour: number | null;
    purity_grade: "A+" | "A" | "B+" | "B" | "C";
  };
  certifications: string[];
}

export interface CycleGearItem extends BaseItem {
  vertical: "cyclegear";
  category:
    | "power-meter"
    | "gps-computer"
    | "smart-trainer"
    | "road-tire"
    | "drivetrain";
  specs: {
    weight_g: number;
    claimed_accuracy_pct: number | null;
    left_right_balance: boolean | null;
    mount_or_form_factor: string;
    connectivity: string[];
    battery_life_hours: number | null;
    waterproof_rating: string | null;
    tire_width_mm: number | null;
    hookless_compatible: boolean | null;
    hookless_max_psi: number | null;
    max_trainer_watts: number | null;
    max_trainer_grade_pct: number | null;
    trainer_noise_dba: number | null;
    drivetrain_speeds: number | null;
    key_specs_kv: Array<{ key_en: string; key_ko: string; value: string }>;
  };
  compatibility_graph: {
    bb_or_mount_standard: string;
    freehub_or_cleat_standard: string;
    drivetrain_compatible: string[];
    head_unit_or_app_verified: string[];
    incompatible_notes_en: string[];
    incompatible_notes_ko: string[];
  };
  safety_warning: {
    requires_hookless_warning: boolean;
    torque_or_install_note_en: string;
    torque_or_install_note_ko: string;
  };
}

export type AnyItem = WattCheckItem | PureGramItem | CycleGearItem;

export interface VsInsight {
  pair_slug: string;
  vertical: Vertical;
  slug_a: string;
  slug_b: string;
  release_wave: number;
  info_gain_score: number;
  serp_gaps_captured: string[];
  verdict: {
    en: {
      headline: string;
      choose_a_if: string[];
      choose_b_if: string[];
      bottom_line: string;
    };
    ko: {
      headline: string;
      choose_a_if: string[];
      choose_b_if: string[];
      bottom_line: string;
    };
  };
}

export interface MatrixPage {
  slug: string;
  vertical: Vertical;
  archetype: "matrix" | "compat";
  release_wave: number;
  filter_category: string | null;
  featured_item_slugs: string[];
  i18n: {
    en: {
      title: string;
      subtitle: string;
      intro: string;
      methodology_note: string;
      key_takeaways: string[];
    };
    ko: {
      title: string;
      subtitle: string;
      intro: string;
      methodology_note: string;
      key_takeaways: string[];
    };
  };
}

export interface FxRates {
  base: "USD";
  source: string;
  updated_at: string;
  rates: Record<"USD" | "KRW" | "JPY" | "EUR" | "GBP", number>;
}
