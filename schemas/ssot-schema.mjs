import { z } from "zod";

export const LocaleEnum = z.enum(["en", "ko", "ja", "de", "es"]);
export const VerticalEnum = z.enum(["wattcheck", "puregram", "cyclegear", "hometech"]);
export const AvailabilityEnum = z.enum([
  "IN_STOCK",
  "OUT_OF_STOCK_TEMP",
  "DISCONTINUED_OR_404",
  "PRICE_STALE",
]);

const SlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IsoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const RealAsinRegex = /^B0[0-9A-Z]{8}$/;

// Known placeholder patterns forbidden by SM-02
const ForbiddenAsinPatterns = [
  /ASSIOMA/i,
  /PLACEHOLDER/i,
  /TEST/i,
  /DUMMY/i,
  /SAMPLE/i,
  /XXXXX/i,
  /^B000000000$/,
];

export const CitationSchema = z.object({
  label: z.string().min(4),
  url: z.string().url().refine((u) => u.startsWith("https://"), {
    message: "Citation URL must use https://",
  }),
  source_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  verified_at: z.string().regex(IsoDateRegex),
});

export const RegionalOfferSchema = z.object({
  asin: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        if (!RealAsinRegex.test(val)) return false;
        return !ForbiddenAsinPatterns.some((re) => re.test(val));
      },
      { message: "ASIN must be null or a valid real Amazon ASIN (no placeholders)" }
    ),
  sku: z.string().nullable().optional(),
  msrp: z.number().positive(),
  currency: z.enum(["USD", "KRW", "JPY", "EUR", "GBP"]),
  price_mode: z.literal("msrp_benchmark_mode"),
  price_checked_at: z.string().regex(IsoDateRegex),
  search_query: z.string().min(3),
  status: AvailabilityEnum,
});

export const LocaleCopySchema = z.object({
  name: z.string().min(3),
  title: z.string().min(10),
  summary: z.string().min(30),
  best_for: z.string().min(10),
  local_gotchas: z.array(z.string().min(10)).min(2),
});

export const AuditMetaSchema = z.object({
  fact_checked_at: z.string().regex(IsoDateRegex),
  adversarial_pass: z.literal(true),
  trust_score: z.number().min(95).max(100),
  info_gain_score: z.number().min(75).max(100),
  human_spot_checked: z.boolean(),
});

export const BaseItemSchema = z.object({
  schema_version: z.literal("2.0.0"),
  vertical: VerticalEnum,
  slug: z.string().regex(SlugRegex),
  release_wave: z.number().int().min(1).max(4),
  available_locales: z.array(LocaleEnum).min(2),
  brand: z.string().min(2),
  model_number: z.string().min(1),
  origin_country: z.string().length(2),
  regional_offers: z.object({
    us: RegionalOfferSchema,
    kr: RegionalOfferSchema,
    jp: RegionalOfferSchema.optional(),
    de: RegionalOfferSchema.optional(),
    es: RegionalOfferSchema.optional(),
  }),
  i18n: z.object({
    en: LocaleCopySchema,
    ko: LocaleCopySchema,
    ja: LocaleCopySchema.optional(),
    de: LocaleCopySchema.optional(),
    es: LocaleCopySchema.optional(),
  }),
  citations: z.array(CitationSchema).min(2),
  audit: AuditMetaSchema,
  successor_slug: z.string().nullable().optional(),
  auto_fallback_slugs: z.array(z.string().regex(SlugRegex)).optional(),
});

// ---------------- Vertical 1: WattCheck ----------------

export const PortDefSchema = z.object({
  id: z.string().min(2),
  type: z.enum(["USB-C", "USB-A", "AC", "DC", "Car-12V"]),
  max_w: z.number().positive(),
  protocols: z.array(z.string().min(2)).min(1),
});

export const PortAllocationSchema = z.object({
  active_ports: z.array(z.string().min(2)).min(1),
  output_w: z.record(z.string(), z.number().nonnegative()),
});

export const WattCheckItemSchema = BaseItemSchema.extend({
  vertical: z.literal("wattcheck"),
  category: z.enum(["power-bank", "gan-charger", "power-station"]),
  specs: z.object({
    has_battery: z.boolean(),
    nominal_capacity_mah: z.number().nonnegative().nullable(),
    rated_capacity_mah_5v: z.number().nonnegative().nullable(),
    battery_energy_wh: z.number().nonnegative().nullable(),
    nominal_voltage_v: z.number().positive().nullable(),
    cell_chemistry: z.string().nullable(),
    conversion_efficiency_pct: z.number().min(60).max(95).nullable(),
    wh_printed_on_body: z.boolean().nullable(),
    input_voltage_range: z.string().min(4),
    japan_100v_output_limit_w: z.number().positive().nullable(),
    ul_etl_certified: z.boolean(),
    ce_certified: z.boolean(),
    ccc_certified: z.boolean(),
    pse_certified: z.boolean(),
    kc_certified: z.boolean(),
    weight_g: z.number().positive(),
    dimensions_mm: z.object({
      l: z.number().positive(),
      w: z.number().positive(),
      h: z.number().positive(),
    }),
    max_total_output_w: z.number().positive(),
    max_single_port_output_w: z.number().positive(),
    max_input_w: z.number().positive(),
    supports_pd_3_1_epr: z.boolean(),
    supports_samsung_pps_45w: z.boolean(),
    supports_pass_through: z.boolean(),
    power_renegotiation_drop: z.boolean(),
    ports: z.array(PortDefSchema).min(1),
    port_allocation_matrix: z.array(PortAllocationSchema).min(1),
  }),
  airline_compliance_profile: z.object({
    iata_tier: z.enum([
      "no_battery_always_allowed",
      "under_100wh_no_approval",
      "100_to_160wh_approval_required",
      "over_160wh_prohibited",
    ]),
    carryon_allowed: z.boolean(),
    carryon_no_approval: z.boolean(),
    checked_baggage: z.enum(["allowed", "prohibited"]),
    korea_molit_2026_notes: z.string().min(10),
    china_domestic_ccc_ok: z.boolean(),
  }),
});

export const AirlineSchema = z.object({
  slug: z.string().regex(SlugRegex),
  iata_code: z.string().min(2).max(4),
  region: z.enum(["KR", "NA", "EU", "APAC", "ME"]),
  name_en: z.string().min(2),
  name_ko: z.string().min(2),
  under_100wh_max_pcs: z.number().int().min(1).max(20),
  between_100_160wh_max_pcs: z.number().int().min(0).max(4),
  between_100_160wh_requires_approval: z.boolean(),
  over_160wh_allowed: z.literal(false),
  overhead_bin_prohibited: z.boolean(),
  inflight_charging_prohibited: z.boolean(),
  terminal_insulation_pouch_required: z.boolean(),
  wh_marking_strict: z.boolean(),
  ccc_marking_required_domestic: z.boolean(),
  notes_en: z.string().min(15),
  notes_ko: z.string().min(15),
  official_policy_url: z.string().url(),
  verified_at: z.string().regex(IsoDateRegex),
});

// ---------------- Vertical 2: PureGram ----------------

export const PureGramItemSchema = BaseItemSchema.extend({
  vertical: z.literal("puregram"),
  category: z.enum(["energy-gel", "electrolyte", "creatine", "carb-mix"]),
  package_spec: z.object({
    net_weight_g: z.number().positive(),
    total_servings: z.number().positive(),
    serving_weight_g: z.number().positive(),
    unit_type: z.enum(["packet", "scoop", "tablet", "pouch"]),
    flavors_tracked: z.array(z.string().min(2)).min(1),
  }),
  nutrition_label: z.object({
    calories_kcal: z.number().nonnegative(),
    active_ingredient_type: z.enum([
      "carbohydrates",
      "creatine_monohydrate",
      "electrolytes_sodium_potassium",
    ]),
    active_per_serving_g: z.number().positive(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    sugar_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
    carb_ratio_glucose_to_fructose: z.string().nullable(),
    caffeine_mg: z.number().nonnegative(),
    sodium_mg: z.number().nonnegative(),
    potassium_mg: z.number().nonnegative(),
    magnesium_mg: z.number().nonnegative(),
    creapure_certified: z.boolean(),
    hydrogel_or_isotonic: z.enum(["hydrogel", "isotonic", "standard", "none"]),
    free_form_amino_listed: z.boolean(),
    artificial_sweeteners_listed: z.boolean(),
    sweetener_details: z.string().min(2),
  }),
  derived_math: z.object({
    purity_pct: z.number().positive().max(100),
    total_pure_active_g: z.number().positive(),
    benchmark_unit_g: z.number().positive(),
    benchmark_label_en: z.string().min(4),
    benchmark_label_ko: z.string().min(4),
    servings_for_90g_per_hour: z.number().positive().nullable(),
    purity_grade: z.enum(["A+", "A", "B+", "B", "C"]),
  }),
  certifications: z.array(z.string().min(2)).min(1),
});

// ---------------- Vertical 3: CycleGear ----------------

export const CycleGearItemSchema = BaseItemSchema.extend({
  vertical: z.literal("cyclegear"),
  category: z.enum([
    "power-meter",
    "gps-computer",
    "smart-trainer",
    "road-tire",
    "drivetrain",
  ]),
  specs: z.object({
    weight_g: z.number().positive(),
    claimed_accuracy_pct: z.number().min(0.5).max(3.0).nullable(),
    left_right_balance: z.boolean().nullable(),
    mount_or_form_factor: z.string().min(3),
    connectivity: z.array(z.string().min(2)),
    battery_life_hours: z.number().positive().nullable(),
    waterproof_rating: z.string().nullable(),
    tire_width_mm: z.number().min(23).max(45).nullable(),
    hookless_compatible: z.boolean().nullable(),
    hookless_max_psi: z.number().positive().max(73).nullable(),
    max_trainer_watts: z.number().positive().nullable(),
    max_trainer_grade_pct: z.number().positive().nullable(),
    trainer_noise_dba: z.number().min(15).max(85).nullable(),
    drivetrain_speeds: z.number().int().min(11).max(13).nullable(),
    key_specs_kv: z
      .array(
        z.object({
          key_en: z.string().min(2),
          key_ko: z.string().min(2),
          value: z.string().min(1),
        })
      )
      .min(6),
  }),
  compatibility_graph: z.object({
    bb_or_mount_standard: z.string().min(3),
    freehub_or_cleat_standard: z.string().min(3),
    drivetrain_compatible: z.array(z.string().min(2)).min(1),
    head_unit_or_app_verified: z.array(z.string().min(2)).min(1),
    incompatible_notes_en: z.array(z.string().min(10)).min(1),
    incompatible_notes_ko: z.array(z.string().min(10)).min(1),
  }),
  safety_warning: z.object({
    requires_hookless_warning: z.boolean(),
    torque_or_install_note_en: z.string().min(10),
    torque_or_install_note_ko: z.string().min(10),
  }),
});

// ---------------- VS Insights & Matrix/Compat & Audit Log ----------------

export const VsInsightSchema = z.object({
  pair_slug: z.string().regex(/^[a-z0-9-]+-vs-[a-z0-9-]+$/),
  vertical: VerticalEnum,
  slug_a: z.string().regex(SlugRegex),
  slug_b: z.string().regex(SlugRegex),
  release_wave: z.number().int().min(1).max(4),
  info_gain_score: z.number().min(75).max(100),
  serp_gaps_captured: z.array(z.string().min(10)).min(3),
  verdict: z.object({
    en: z.object({
      headline: z.string().min(15),
      choose_a_if: z.array(z.string().min(10)).min(2),
      choose_b_if: z.array(z.string().min(10)).min(2),
      bottom_line: z.string().min(30),
    }),
    ko: z.object({
      headline: z.string().min(12),
      choose_a_if: z.array(z.string().min(8)).min(2),
      choose_b_if: z.array(z.string().min(8)).min(2),
      bottom_line: z.string().min(25),
    }),
  }),
}).refine((v) => v.slug_a < v.slug_b && v.pair_slug === `${v.slug_a}-vs-${v.slug_b}`, {
  message: "VS pair must strictly obey canonical alphabetical order: slug_a < slug_b",
});

export const MatrixPageSchema = z.object({
  slug: z.string().regex(SlugRegex),
  vertical: VerticalEnum,
  archetype: z.enum(["matrix", "compat"]),
  release_wave: z.number().int().min(1).max(4),
  filter_category: z.string().nullable(),
  featured_item_slugs: z.array(z.string().regex(SlugRegex)).min(3),
  i18n: z.object({
    en: z.object({
      title: z.string().min(10),
      subtitle: z.string().min(20),
      intro: z.string().min(40),
      methodology_note: z.string().min(20),
      key_takeaways: z.array(z.string().min(12)).min(3),
    }),
    ko: z.object({
      title: z.string().min(8),
      subtitle: z.string().min(15),
      intro: z.string().min(30),
      methodology_note: z.string().min(15),
      key_takeaways: z.array(z.string().min(10)).min(3),
    }),
  }),
});

export const AuditLogSchema = z.object({
  sku_slug: z.string().regex(SlugRegex),
  vertical: VerticalEnum,
  audited_at: z.string().regex(IsoDateRegex),
  trust_score: z.number().min(95).max(100),
  evidence_quotes: z
    .array(
      z.object({
        field: z.string().min(2),
        quote: z.string().min(8),
        source_url: z.string().url(),
        source_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      })
    )
    .min(2),
  adversarial_checks: z.array(z.string().min(10)).min(2),
  contradictions: z.array(z.string()).max(0),
  verdict: z.literal("PASS"),
});
