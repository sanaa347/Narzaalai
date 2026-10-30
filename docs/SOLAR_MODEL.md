# Solar sizing: what it is, what it is not

**Status: preliminary planning aid. Not validated. Not an engineering model. Not a quotation.**

Code: `src/lib/solar/prelim.ts` (calculation), `src/lib/solar/estimator.ts` (boundary). Version string: `prelim-sizing-0.1.0`.
Every result stored or shown carries this version, its inputs, its assumptions and its limitations, so any result can be
recomputed from the recorded input.

## Inputs (all customer-provided and unverified)

| Input | Used for |
|---|---|
| `monthlyKwh` (kWh per month, may be unknown) | The only quantity that drives the numbers |
| `installAreaM2` | Compared with the area the options would need ("fits" / "may not fit" / "unknown") |
| `backupNeeded`, `hasCriticalLoads` | Choose which battery *note* is shown. They never produce a battery size |
| `hasCoordinates`, `hasShadingInfo` | Confidence level and the "missing information" list only. Not used in any formula |

## Formula (complete)

```
annual_kWh        = monthly_kWh × 12
target_kWh        = annual_kWh × offset            offset ∈ {0.5, 0.8}
kWp_low           = target_kWh ÷ 1500              (high specific yield → fewer kWp)
kWp_high          = target_kWh ÷ 1100              (low specific yield  → more kWp)
area_m2_low/high  = kWp_low × 5.5  /  kWp_high × 7.0
```

Constants (`SPECIFIC_YIELD_KWH_PER_KWP_YEAR`, `MODULE_AREA_M2_PER_KWP`, `OFFSET_TARGETS`) are **planning assumptions chosen by
the developers. They were not derived from measured Mongolian sites and have no validation evidence.** They are printed in
the result's `assumptions` list so the customer and staff can see them.

Worked example (reproduced by running the code): 400 kWh/month → 4,800 kWh/year. 50 % offset → 2,400 kWh → **1.6 – 2.2 kWp**,
needing 8.8 – 15.3 m². 80 % offset → 3,840 kWh → **2.6 – 3.5 kWp**, needing 14.1 – 24.4 m².

## Output states

* `insufficient_data` – consumption unknown. No options are produced. Next step: provide consumption.
* `preliminary` – a capacity *range* for two offset targets. Confidence is `low` unless coordinates, shading information and
  install area are all given, and then at most `moderate`. It is never "high".
* Every result has `verification: "awaiting_verification"` and the label **PRELIMINARY — NOT A QUOTATION**.

## What it deliberately does not produce

Annual generation (kWh) for a design, savings, payback, cost, tariff or battery size. There is no tariff data, no verified
price data and no irradiance model. `runEstimate()` enforces this in code: an estimator that has no `validation` evidence and
returns a field whose name contains `generation`, `saving`, `payback`, `cost`, `price`, `tariff`, `batterykwh`, `batterysize`,
`irr` or `roi` raises `UnvalidatedClaimError`. A unit test (`tests/solar-estimator-boundary.test.ts`) covers it.

Known technical shortcomings (to be read before anyone treats the numbers as more than a conversation starter):

* Seasonality is ignored. Mongolia has large winter/summer differences in both consumption and irradiance.
* Snow cover, soiling, temperature effects, tilt/azimuth, shading and inverter/battery losses are not modelled.
* Offsetting 50 % / 80 % of *annual* kWh says nothing about when power is available. Without a battery or grid export rules,
  the self-consumed share can be far lower.
* Off-grid and backup sizing (autonomy hours, critical-load power) needs data the wizard does not collect.
* The yield range may be wrong for a given site. **A site survey and a supplier's design are always required.**

## How a validated model plugs in

Implement `Estimator<Input, Result>` from `estimator.ts` and declare `validation: { reference, validatedOn, scope }` – where
the yield figures were compared with measured data, by whom, and when. Only then may `runEstimate` accept generation, cost or
savings fields. The guard checks that evidence is *present*, not that it is *good*; it is a claim a named person is
accountable for. Until such evidence exists, do not add those fields, and do not edit the constants above to make results look
more precise.
