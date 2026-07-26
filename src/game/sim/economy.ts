import type { DailyLedger, DayStats, Fares, Policies } from '../types';
import { COSTS, vehicleType } from '../constants';
import { Network } from './network';

/** Fresh zeroed ledger. */
export const emptyLedger = (): DailyLedger => ({
  fareRevenue: 0,
  otherRevenue: 0,
  operatingCost: 0,
  staffCost: 0,
  maintenance: 0,
  interest: 0,
  grant: 0,
  capex: 0,
});

export class EconomySystem {
  cash: number;
  loan = 0;
  ledger = emptyLedger();
  fares: Fares;
  policies: Policies = { congestionCharge: false, bikeShare: 0, advertising: true };
  /** compounding cost multiplier from inflation */
  inflation = 1;

  constructor(
    startCash: number,
    fares: Fares,
    public sandbox: boolean,
    private costScale: number,
    private grantScale: number,
  ) {
    this.cash = startCash;
    this.fares = { ...fares };
  }

  /** Spend if affordable (always allowed in sandbox). Returns success. */
  spend(amount: number, capex = true): boolean {
    if (this.sandbox) return true;
    if (amount > 0 && this.cash - amount < -COSTS.loanMax * 0.25) return false;
    this.cash -= amount;
    if (capex) this.ledger.capex += amount;
    return true;
  }

  earnFare(fare: number): void {
    if (this.sandbox) return;
    this.cash += fare;
    this.ledger.fareRevenue += fare;
  }

  takeLoan(amount: number): boolean {
    if (this.loan + amount > COSTS.loanMax) return false;
    this.loan += amount;
    this.cash += amount;
    return true;
  }

  repayLoan(amount: number): void {
    const pay = Math.min(amount, this.loan, Math.max(0, this.cash));
    this.loan -= pay;
    this.cash -= pay;
  }

  /**
   * Daily settlement at 03:00. Returns the day's profit and CO2 tonnes.
   * `vehicleKm` per mode is accumulated by the engine during the day.
   */
  settleDay(
    net: Network,
    vehicleKm: Map<string, number>,
    day: number,
    happiness: number,
    dailyPassengers: number,
  ): { profit: number; co2: number; revenue: number; costs: number } {
    const led = this.ledger;
    const infl = this.inflation;
    let co2g = 0;

    // Operating + staff per vehicle; upkeep for stops and routes.
    for (const r of net.routes) {
      if (!r) continue;
      led.maintenance += COSTS.routeAdminPerDay * infl * this.costScale;
      const vt = vehicleType(r.vehicleType);
      let count = 0;
      for (const v of net.vehicles.values()) if (v.routeId === r.id) count++;
      led.staffCost += count * vt.staffPerDay * infl * this.costScale;
    }
    for (const [typeId, km] of vehicleKm) {
      const vt = vehicleType(typeId);
      led.operatingCost += km * vt.costPerKm * infl * this.costScale;
      co2g += km * vt.co2PerKm;
    }
    for (const s of net.stops) {
      if (!s) continue;
      led.maintenance +=
        (s.mode === 'tube' ? COSTS.stationUpkeepPerDay : COSTS.stopUpkeepPerDay) * infl * this.costScale;
    }

    // Ancillary revenue.
    if (this.policies.advertising) led.otherRevenue += net.vehicles.size * 55 * infl;
    let tubeStations = 0;
    for (const s of net.stops) if (s && s.mode === 'tube') tubeStations++;
    led.otherRevenue += tubeStations * 900 * infl; // station retail rents
    if (this.policies.congestionCharge) led.otherRevenue += 350_000 * infl;
    led.otherRevenue += this.policies.bikeShare * 12_000 * infl;

    // Loans + weekly grant.
    led.interest = this.loan * COSTS.loanDailyRate;
    if (day % 7 === 0) {
      const perf = Math.max(0, (happiness - 45) / 55); // 0..1
      led.grant = (2_000_000 + perf * 6_000_000 + dailyPassengers * 8) * this.grantScale;
    }

    const profit =
      led.fareRevenue + led.otherRevenue + led.grant -
      (led.operatingCost + led.staffCost + led.maintenance + led.interest);
    if (!this.sandbox) {
      this.cash += led.otherRevenue + led.grant - (led.operatingCost + led.staffCost + led.maintenance + led.interest);
    }

    // Slow inflation.
    this.inflation *= 1 + COSTS.inflationPerYear / 365;
    const revenue = led.fareRevenue + led.otherRevenue + led.grant;
    const costs = led.operatingCost + led.staffCost + led.maintenance + led.interest;
    this.ledger = emptyLedger();
    return { profit, co2: co2g / 1e6, revenue, costs };
  }
}

/** Ring-buffer style stats history (kept small enough to save whole). */
export class StatsHistory {
  history: DayStats[] = [];

  push(s: DayStats): void {
    this.history.push(s);
    if (this.history.length > 365) this.history.shift();
  }
}
