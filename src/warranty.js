// Deterministic warranty rules engine.
// The language model never decides coverage on its own: it gathers the facts
// (vehicle, component, likely cause, how the bike was used) and this module
// returns the decision with the policy clauses behind it.

export const COMPONENTS = [
  "battery", "motor", "controller", "charge_port", "charging_cable",
  "brakes_hydraulic", "brake_pads", "tyres", "chain_sprockets",
  "suspension", "frame", "steering", "electronics", "lights",
  "mirrors", "levers_grips", "other",
];

export const CAUSES = ["defect", "wear", "crash", "pressure_washing", "unknown"];
export const USAGE = ["road", "trail", "competition", "unknown"];

const WEAR_ITEMS = new Set(["brake_pads", "tyres", "chain_sprockets", "levers_grips"]);
const LOW_VALUE_ACCESSORIES = new Set(["charging_cable", "mirrors", "levers_grips"]);
const POWERTRAIN = new Set(["battery", "motor", "controller", "electronics"]);
const EU_COUNTRIES = new Set(["ES", "PT", "FR", "IT", "DE", "NL", "BE", "AT", "IE", "SE", "DK", "FI", "PL"]);

const DAY = 24 * 60 * 60 * 1000;
const yearsBetween = (a, b) => (b - a) / (365.25 * DAY);
const addYears = (d, y) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() + y); return x; };
const addMonths = (d, m) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
const iso = (d) => d.toISOString().slice(0, 10);

function legalGuarantee(vehicle) {
  if (vehicle.owner_type !== "consumer" || !EU_COUNTRIES.has(vehicle.country)) return null;
  // Spain: 3 years for goods delivered from 2022, defect presumed for the first 2 years.
  const years = vehicle.country === "ES" ? 3 : 2;
  const presumptionYears = vehicle.country === "ES" ? 2 : 1;
  const delivered = new Date(vehicle.delivery_date + "T00:00:00Z");
  return { until: addYears(delivered, years), presumptionUntil: addYears(delivered, presumptionYears) };
}

export function checkWarranty({ vehicle, component, cause = "unknown", usage = "unknown", safety_symptom = false, asOf = new Date() }) {
  if (!vehicle) throw new Error("Unknown VIN: look the vehicle up first.");
  if (!COMPONENTS.includes(component)) throw new Error(`Unknown component "${component}". Use one of: ${COMPONENTS.join(", ")}.`);
  if (!CAUSES.includes(cause)) cause = "unknown";
  if (!USAGE.includes(usage)) usage = "unknown";

  const now = asOf instanceof Date ? asOf : new Date(asOf + "T00:00:00Z");
  const delivered = new Date(vehicle.delivery_date + "T00:00:00Z");
  const ageYears = yearsBetween(delivered, now);

  const isBattery = component === "battery";
  const commercialUntil = addYears(delivered, isBattery ? 5 : 2);
  const withinMileage = !isBattery || vehicle.mileage_km <= 50000;
  const inCommercial = now <= commercialUntil && withinMileage;
  const legal = legalGuarantee(vehicle);

  const lastService = new Date((vehicle.last_service_date || vehicle.delivery_date) + "T00:00:00Z");
  const serviceOverdue = now > addMonths(lastService, 13); // 12 months plus 1 month grace
  const competition = usage === "competition" || (vehicle.usage_flags || []).some((f) => f.startsWith("competition_use"));

  const facts = {
    vin: vehicle.vin,
    vehicle_age_years: Math.round(ageYears * 10) / 10,
    owner_type: vehicle.owner_type,
    country: vehicle.country,
    commercial_warranty_until: iso(commercialUntil) + (isBattery ? " (or 50,000 km)" : ""),
    legal_guarantee_until: legal ? iso(legal.until) : "not applicable",
    service_overdue: serviceOverdue,
    competition_use: competition,
    modifications: vehicle.modifications || [],
  };
  const out = (decision, basis, reasons, clauses, next_steps, priority = "P3") =>
    ({ decision, coverage_basis: basis, reasons, clauses, next_steps, priority, facts });

  // 1. Safety first: never handled autonomously.
  if (safety_symptom) {
    return out("escalate_safety", "safety",
      ["Safety-critical symptom reported: a human must take over before any warranty discussion."],
      ["KB-05"],
      ["Tell the rider to stop riding (and keep away from the bike if the battery is involved).", "Escalate to a human at priority P1 now."],
      "P1");
  }

  // 2. Causes that are excluded whatever the bike's age.
  if (cause === "crash") {
    return out("not_covered", "exclusion", ["Damage caused by a crash, fall or impact is excluded."], ["KB-01"],
      ["Explain the exclusion kindly.", "Offer a paid repair quote at an authorised dealer; suggest checking their motor insurance."]);
  }
  if (cause === "pressure_washing") {
    return out("not_covered", "exclusion", ["Water forced into connectors by a pressure washer is excluded."], ["KB-01", "KB-10"],
      ["Offer a paid repair quote.", "Share the washing guidance so it does not happen again."]);
  }

  // 3. Wear items.
  if (WEAR_ITEMS.has(component)) {
    if (cause === "defect") {
      return out("needs_human", "possible_defect_on_wear_item",
        ["Wear items are excluded, but the customer reports a defect rather than normal wear: a person should review the evidence."],
        ["KB-01", "KB-03"], ["Ask for photos and mileage.", "Escalate to the warranty team."]);
    }
    if (LOW_VALUE_ACCESSORIES.has(component)) {
      return out("offer_replacement", "wear_item_low_value", ["Normal wear on a low-value part is not covered."], ["KB-01", "KB-09"],
        ["Offer a new part: faster than a repair and it comes with its own 2-year parts warranty."]);
    }
    return out("not_covered", "wear_item", ["Normal wear of this part is excluded from the warranty."], ["KB-01"],
      ["Explain the exclusion.", "Offer to book the replacement at a dealer or check part availability."]);
  }

  // 4. Cause not established yet: diagnose first.
  if (cause === "unknown") {
    const ifDefect = inCommercial ? "covered by the commercial warranty" :
      legal && now <= legal.until ? "likely covered by the legal guarantee" : "outside warranty";
    return out("needs_diagnosis", "pending_inspection",
      [`The cause is not established. If a defect is confirmed, the repair would be ${ifDefect}.`],
      ["KB-03"], ["Book an inspection at the nearest authorised dealer.", "Tell the customer that a diagnosis confirming a covered defect is free."]);
  }

  // From here the cause is "defect" or "wear" on a non-wear component.
  if (cause === "wear" && LOW_VALUE_ACCESSORIES.has(component)) {
    return out("offer_replacement", "wear_low_value", ["Normal wear on a low-value accessory is not covered."], ["KB-09"],
      ["Offer a new part: faster than a repair and it comes with its own 2-year parts warranty."]);
  }
  if (cause === "wear" && !(isBattery && vehicle.battery_health_pct < 70)) {
    return out("not_covered", "normal_wear", ["Normal wear is not a defect."], ["KB-01"], ["Explain, and offer a maintenance booking."]);
  }

  // 5. Competition use.
  if (competition && !(vehicle.race_programme && (isBattery || component === "motor"))) {
    if (legal && now <= legal.until) {
      return out("needs_human", "competition_use_with_legal_rights",
        ["Competition use is excluded from the commercial warranty, but this consumer still has legal guarantee rights: a person must assess whether racing caused the fault."],
        ["KB-11", "KB-02"], ["Escalate to the warranty team with the telemetry evidence."]);
    }
    return out("not_covered", "competition_use",
      ["Racing or timed track use is excluded unless the bike is in the Race Support Programme."],
      ["KB-11"], ["Explain the exclusion.", "Mention the Race Support Programme for future seasons.", "Offer a paid repair quote."]);
  }

  // 6. Unauthorised modifications that could explain the fault.
  if ((vehicle.modifications || []).length && POWERTRAIN.has(component)) {
    return out("needs_human", "modification_review",
      ["An unauthorised modification is recorded on a related system: a person must check whether it caused the fault."],
      ["KB-01"], ["Escalate to the warranty team.", "Ask the customer whether the modification can be reverted before inspection."]);
  }

  // 7. Inside the commercial warranty.
  if (inCommercial) {
    if (serviceOverdue && POWERTRAIN.has(component)) {
      return out("needs_human", "service_overdue_review",
        ["Within warranty, but the mandatory service is overdue: missed services are reviewed case by case, not refused automatically."],
        ["KB-01", "KB-06"], ["Escalate to the warranty team.", "Book the overdue service together with the inspection."]);
    }
    return out("covered", "commercial_warranty",
      [isBattery && vehicle.battery_health_pct < 70
        ? `Battery health is ${vehicle.battery_health_pct}%, below the 70% threshold, within 5 years and 50,000 km.`
        : "Defect within the commercial warranty period."],
      ["KB-01"], ["Approve the claim and book the repair at the nearest authorised dealer.", "Check part availability for the region."]);
  }

  // 8. Outside the commercial warranty: legal guarantee for EU consumers.
  if (legal && now <= legal.until) {
    if (now <= legal.presumptionUntil) {
      return out("covered", "legal_guarantee",
        ["Outside the commercial warranty, but within the consumer's legal guarantee, and the defect is presumed to have existed at delivery."],
        ["KB-02"], ["Approve the claim under the legal guarantee and book the repair."]);
    }
    return out("needs_human", "legal_guarantee_evidence",
      ["Within the legal guarantee but past the 2-year presumption: the customer may need to show the defect existed at delivery. A person must assess it."],
      ["KB-02"], ["Collect evidence (photos, history, dealer report).", "Escalate to the warranty team."]);
  }

  // 9. Goodwill window.
  const goodwillUntil = addMonths(commercialUntil, 3);
  if (now <= goodwillUntil && !serviceOverdue) {
    return out("needs_human", "goodwill_review",
      ["Just outside warranty with a full service history: only the warranty team can approve goodwill."],
      ["KB-09"], ["Escalate to the warranty team as a goodwill request."]);
  }

  if (LOW_VALUE_ACCESSORIES.has(component)) {
    return out("offer_replacement", "out_of_warranty_low_value", ["Out of warranty; low-value part."], ["KB-09"],
      ["Offer a new part instead of a repair."]);
  }
  return out("not_covered", "out_of_warranty", ["The vehicle is outside all warranty periods for this component."], ["KB-01", "KB-02"],
    ["Explain clearly and offer a paid repair quote."]);
}
