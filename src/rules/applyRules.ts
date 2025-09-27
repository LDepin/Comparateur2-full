// src/rules/applyRules.ts

export type Criteria = {
  adults: number; // >= 1
  childrenAges: number[]; // each 2..11
  infants: number; // 0..3 (approx)
  fareType: "" | "basic" | "flex";
  cabin: "eco" | "premium" | "business" | "first";
  bagsCabin: number; // 0..2 requested
  bagsSoute: number; // 0..2 requested
  resident: boolean; // 0|1
  currency: string; // e.g. "EUR"
  um?: boolean; // user requested UM service
};

export type Itinerary = {
  baseFare: number; // adult price reference (per adult)
  currency?: string;
  segments?: number; // total segment count
  carrierCode?: string; // e.g. "AF"
  brand?: "" | "basic" | "flex";
  cabin?: "eco" | "premium" | "business" | "first";
};

export type Surcharge = {
  code: "UM" | "BAG_HOLD" | "BAG_CABIN" | "RESIDENT_DISCOUNT" | "CHILD_ADJ" | "INFANT_ADJ";
  label: string;
  amount: number;
};

export type ApplyResult = {
  total: number;
  currency: string;
  surcharges: Surcharge[];
  warnings: string[];
  eligible: boolean;
  reasons: string[];
};

// ------------------------------------------------------------------
// Chargement des règles (sans dépendre de resolveJsonModule)
// ------------------------------------------------------------------

type Rules = any;

function loadRules(): Rules {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rules = require("./carriers.rules.json") as any;
  return rules;
}

// Conversion simple de devise si jamais on voulait étendre (placeholder)
function convert(amount: number, from: string | undefined, to: string): number {
  if (!from || from === to) return amount;
  // Placeholder: pour l’instant, 1:1
  return amount;
}

// Utilitaires
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ------------------------------------------------------------------
// Coeur de logique: applyRules
// ------------------------------------------------------------------

export function applyRules(
  itinerary: Itinerary,
  carrierCodeRaw: string | undefined,
  criteria: Criteria
): ApplyResult {
  const rules = loadRules();

  const carrierCode = (carrierCodeRaw || itinerary.carrierCode || "AF").toUpperCase();
  const carrier = rules[carrierCode] || {};
  const currency = criteria.currency || itinerary.currency || "EUR";

  const segments = clamp(itinerary.segments ?? 1, 1, 20);

  // Paramètres voyageurs
  const adults = clamp(criteria.adults ?? 1, 1, 9);
  const childrenAges = Array.isArray(criteria.childrenAges) ? criteria.childrenAges.filter((a) => a >= 2 && a <= 11) : [];
  const infants = clamp(criteria.infants ?? 0, 0, 3);

  const fareType = (criteria.fareType || itinerary.brand || "") as "" | "basic" | "flex";
  const cabin = (criteria.cabin || itinerary.cabin || "eco") as "eco" | "premium" | "business" | "first";

  const bagsCabinReq = clamp(criteria.bagsCabin ?? 0, 0, 2);
  const bagsHoldReq = clamp(criteria.bagsSoute ?? 0, 0, 2);

  const resident = !!criteria.resident;
  const wantsUM = !!criteria.um;

  const surcharges: Surcharge[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  // 1) Base: prix adulte * nb adultes
  const adultBase = Math.max(0, itinerary.baseFare || 0);
  let total = 0;

  // 1.1) Pricing enfants/bébés
  const childCfg = carrier.childPricing || {
    childPercentOfAdult: 0.75,
    infantNoSeatPercent: 0.1,
    infantSeatPercent: 0.75
  };

  // adultes
  total += adults * convert(adultBase, itinerary.currency, currency);

  // enfants (2..11) -> % adulte (si pas de base enfant fournie par upstream)
  if (childrenAges.length) {
    const childPct = clamp(childCfg.childPercentOfAdult ?? 0.75, 0, 1.5);
    const childUnit = Math.round(convert(adultBase, itinerary.currency, currency) * childPct);
    total += childrenAges.length * childUnit;
    surcharges.push({ code: "CHILD_ADJ", label: "Tarif enfants", amount: childrenAges.length * childUnit });
  }

  // bébés: on suppose sans siège (le plus courant) → infantNoSeatPercent
  if (infants > 0) {
    const infantPct = clamp(childCfg.infantNoSeatPercent ?? 0.1, 0, 1.0);
    const infantUnit = Math.round(convert(adultBase, itinerary.currency, currency) * infantPct);
    total += infants * infantUnit;
    surcharges.push({ code: "INFANT_ADJ", label: "Tarif bébés", amount: infants * infantUnit });
  }

  // 2) Bagages
  // Configuration bagages + overrides selon brand/cabin
  const bagCfgBase = carrier.baggage || {
    cabinIncluded: 1,
    holdIncluded: 0,
    holdFee: 30,
    cabinFee: 20,
    perSegment: true,
    brandOverrides: {}
  };

  // Applique override
  let includedCabin = bagCfgBase.cabinIncluded ?? 1;
  let includedHold = bagCfgBase.holdIncluded ?? 0;
  const brandMap = bagCfgBase.brandOverrides || {};
  const brandOverride =
    brandMap[fareType] ||
    brandMap[cabin] ||
    null;

  if (brandOverride) {
    if (typeof brandOverride.cabinIncluded === "number") includedCabin = brandOverride.cabinIncluded;
    if (typeof brandOverride.holdIncluded === "number") includedHold = brandOverride.holdIncluded;
  }

  const cabinFee = Math.max(0, bagCfgBase.cabinFee ?? 20);
  const holdFee = Math.max(0, bagCfgBase.holdFee ?? 30);
  const bagPerSeg = !!bagCfgBase.perSegment;

  // Bagages demandés au total (adultes + enfants + bébés si siège ? ici on ne compte pas de siège pour bébés)
  const paxCountNoInfants = adults + childrenAges.length; // bébés sans siège exclus
  const totalCabinReq = Math.max(0, paxCountNoInfants * bagsCabinReq);
  const totalHoldReq = Math.max(0, paxCountNoInfants * bagsHoldReq);

  // Inclus par pax
  const totalCabinIncluded = paxCountNoInfants * Math.max(0, includedCabin);
  const totalHoldIncluded = paxCountNoInfants * Math.max(0, includedHold);

  const extraCabin = Math.max(0, totalCabinReq - totalCabinIncluded);
  const extraHold = Math.max(0, totalHoldReq - totalHoldIncluded);

  if (extraCabin > 0) {
    const unit = Math.round(convert(cabinFee, "EUR", currency));
    const count = extraCabin * (bagPerSeg ? segments : 1);
    const amount = unit * count;
    total += amount;
    surcharges.push({ code: "BAG_CABIN", label: "Bagages cabine sup.", amount });
  }
  if (extraHold > 0) {
    const unit = Math.round(convert(holdFee, "EUR", currency));
    const count = extraHold * (bagPerSeg ? segments : 1);
    const amount = unit * count;
    total += amount;
    surcharges.push({ code: "BAG_HOLD", label: "Bagages soute sup.", amount });
  }

  // 3) UM (Unaccompanied Minor)
  // Si l’utilisateur a coché UM : on vérifie l’éligibilité / obligation
  const umCfg = carrier.um || {
    mandatoryUntilAge: 12,
    allowedUntilAge: 16,
    fee: { fixed: 50, perSegment: true, currency: "EUR" }
  };

  if (wantsUM) {
    // On considère qu’il y a au moins un mineur concerné si enfantsAges >= 5 (ex) — ici simplifié :
    const anyMinor = childrenAges.length > 0; // simplification : UM pour enfants 2..11
    if (!anyMinor) {
      warnings.push("UM demandé mais aucun enfant éligible détecté.");
    }
    // Frais UM par segment
    const umFixed = Math.max(0, umCfg.fee?.fixed ?? 0);
    const umCur = umCfg.fee?.currency || "EUR";
    const perSeg = !!umCfg.fee?.perSegment;
    const times = perSeg ? segments : 1;
    if (umFixed > 0) {
      const amount = Math.round(convert(umFixed, umCur, currency)) * times;
      total += amount;
      surcharges.push({ code: "UM", label: "Service UM", amount });
    }
  }

  // Si UM obligatoire (selon compagnie) et enfant sous l’âge mandatoryUntilAge sans UM => inéligible
  const minAgeMandatory = Math.max(0, umCfg.mandatoryUntilAge ?? 0);
  const maxAgeAllowed = Math.max(minAgeMandatory, umCfg.allowedUntilAge ?? minAgeMandatory);

  const youngest = childrenAges.length ? Math.min(...childrenAges) : null;
  if (youngest !== null && youngest < minAgeMandatory && !wantsUM) {
    // Enfant sous l’âge avec UM non demandé
    return {
      total,
      currency,
      surcharges,
      warnings,
      eligible: false,
      reasons: [
        `UM obligatoire jusqu'à ${minAgeMandatory} ans sur ${carrierCode}, cochez l’option UM.`
      ]
    };
  }

  // Résident: simple remise -10% sur total (exemple)
  if (resident) {
    const discount = Math.round(total * 0.1) * -1;
    total += discount;
    surcharges.push({ code: "RESIDENT_DISCOUNT", label: "Réduction résident", amount: discount });
  }

  // Finitions
  total = Math.max(0, Math.round(total));

  return {
    total,
    currency,
    surcharges,
    warnings,
    eligible: true,
    reasons
  };
}