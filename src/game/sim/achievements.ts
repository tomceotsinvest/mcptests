import type { DayStats } from '../types';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstRoute', name: 'Route One', desc: 'Create your first route.' },
  { id: 'tenRoutes', name: 'Network Effect', desc: 'Operate 10 routes at once.' },
  { id: 'newTube', name: 'Tunnel Visionary', desc: 'Open a brand-new Underground line.' },
  { id: 'riverBus', name: 'Master of the Thames', desc: 'Run a river bus service.' },
  { id: 'pax10k', name: 'Ten Thousand Journeys', desc: '10,000 passengers in one day.' },
  { id: 'pax40k', name: 'Moving the Masses', desc: '40,000 passengers in one day.' },
  { id: 'happy80', name: 'Beloved Commissioner', desc: 'Reach 80% passenger happiness.' },
  { id: 'profitDay', name: 'In the Black', desc: 'Finish a day in profit.' },
  { id: 'profitWeek', name: 'Sustainable Operation', desc: 'Seven profitable days in a row.' },
  { id: 'greenFleet', name: 'Clean Air Act', desc: 'A day with under 5 tonnes of CO2.' },
  { id: 'yearOne', name: 'Annual Report', desc: 'Survive a full year in office.' },
  { id: 'billionaire', name: 'War Chest', desc: 'Hold £2bn in cash.' },
];

export interface AchievementCtx {
  routeCount: number;
  hasCustomTube: boolean;
  hasBoat: boolean;
  happiness: number;
  cash: number;
  day: number;
  history: DayStats[];
}

/** Returns ids newly satisfied given current state. */
export function checkAchievements(ctx: AchievementCtx, unlocked: Set<string>): string[] {
  const fresh: string[] = [];
  const win = (id: string, cond: boolean) => {
    if (cond && !unlocked.has(id)) {
      unlocked.add(id);
      fresh.push(id);
    }
  };
  const last = ctx.history[ctx.history.length - 1];
  win('firstRoute', ctx.routeCount > 0);
  win('tenRoutes', ctx.routeCount >= 10);
  win('newTube', ctx.hasCustomTube);
  win('riverBus', ctx.hasBoat);
  win('pax10k', !!last && last.passengers >= 10_000);
  win('pax40k', !!last && last.passengers >= 40_000);
  win('happy80', ctx.happiness >= 80);
  win('profitDay', !!last && last.profit > 0);
  win(
    'profitWeek',
    ctx.history.length >= 7 && ctx.history.slice(-7).every((d) => d.profit > 0),
  );
  win('greenFleet', !!last && last.co2Tonnes < 5 && last.passengers > 5000);
  win('yearOne', ctx.day >= 365);
  win('billionaire', ctx.cash >= 2e9);
  return fresh;
}
