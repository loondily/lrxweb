import type { ProjectConfig, PriceRange } from "@/app/types/project";

/** Цены: [min, max] в рублях. Узкий диапазон — итоговая вилка ±10–15%. */
const PRICES = {
  projectType: {
    landing: [5_200, 6_200],
    corporate: [9_800, 11_800],
    web_app: [15_800, 18_800],
    crm: [28_000, 33_000],
    ecommerce: [14_500, 17_500],
    blog: [4_200, 5_200],
    catalog: [8_500, 10_500],
    saas: [24_000, 28_000],
    booking: [12_000, 14_500],
  },
  modules: {
    auth: [1_800, 2_200],
    user_dashboard: [2_500, 3_000],
    admin_panel: [3_200, 3_800],
    payments: [2_800, 3_400],
    forms: [1_000, 1_250],
    integrations: [1_700, 2_100],
    calculator: [2_100, 2_600],
    multilang: [1_400, 1_700],
    reviews: [1_600, 1_950],
    search: [2_000, 2_400],
    notifications: [1_400, 1_700],
    chat: [2_400, 2_900],
    booking_calendar: [2_700, 3_200],
    subscriptions: [3_200, 3_800],
    analytics: [1_700, 2_100],
    export: [1_500, 1_850],
  },
  page: {
    base: [550, 650],
  },
  designLevel: {
    base: 1,
    custom: 1.4,
    premium: 1.8,
  },
  timeline: {
    standard: 1,
    urgent: 1.2,
    express: 1.4,
  },
} as const;

export function calculatePrice(config: ProjectConfig): PriceRange {
  const [typeMin, typeMax] = PRICES.projectType[config.projectType];
  let min = typeMin;
  let max = typeMax;

  for (const moduleId of config.modules) {
    const range = PRICES.modules[moduleId as keyof typeof PRICES.modules];
    if (range) {
      min += range[0];
      max += range[1];
    }
  }

  const pagePrice = PRICES.page.base;
  min += config.pages.length * pagePrice[0];
  max += config.pages.length * pagePrice[1];

  const designMult = PRICES.designLevel[config.designLevel];
  const timelineMult = PRICES.timeline[config.timeline];
  const mult = designMult * timelineMult;

  return {
    min: Math.round(min * mult),
    max: Math.round(max * mult),
  };
}

/** Базовые сроки в неделях [min, max] по типу проекта (без учёта дизайна и срочности). */
const BASE_WEEKS: Record<keyof typeof PRICES.projectType, [number, number]> = {
  landing: [2, 3],
  corporate: [4, 6],
  web_app: [6, 10],
  crm: [10, 14],
  ecommerce: [6, 9],
  blog: [2, 4],
  catalog: [4, 6],
  saas: [8, 12],
  booking: [5, 8],
};

/** Коэффициент срока: стандарт 1, срочно короче, экспресс ещё короче. */
const TIMELINE_WEEK_FACTOR = {
  standard: 1,
  urgent: 0.8,
  express: 0.65,
} as const;

export type TimelineWeeks = { minWeeks: number; maxWeeks: number };

export function calculateTimeline(config: ProjectConfig): TimelineWeeks {
  const [baseMin, baseMax] = BASE_WEEKS[config.projectType];
  let minW = baseMin;
  let maxW = baseMax;
  const pageWeeks = 0.15;
  const moduleWeeks = 0.2;
  minW += config.pages.length * pageWeeks;
  maxW += config.pages.length * pageWeeks;
  minW += config.modules.length * moduleWeeks;
  maxW += config.modules.length * moduleWeeks;
  const designMult = PRICES.designLevel[config.designLevel];
  const timelineFactor = TIMELINE_WEEK_FACTOR[config.timeline];
  return {
    minWeeks: Math.max(1, Math.round(minW * designMult * timelineFactor)),
    maxWeeks: Math.max(2, Math.round(maxW * designMult * timelineFactor)),
  };
}

export type PriceBreakdownItem = { label: string; min: number; max: number };

export function getPriceBreakdown(config: ProjectConfig): PriceBreakdownItem[] {
  const [typeMin, typeMax] = PRICES.projectType[config.projectType];
  const items: PriceBreakdownItem[] = [
    { label: "База по типу проекта", min: typeMin, max: typeMax },
  ];
  let modMin = 0, modMax = 0;
  for (const moduleId of config.modules) {
    const range = PRICES.modules[moduleId as keyof typeof PRICES.modules];
    if (range) {
      modMin += range[0];
      modMax += range[1];
    }
  }
  if (config.modules.length) {
    items.push({ label: "Модули", min: modMin, max: modMax });
  }
  const pagePrice = PRICES.page.base;
  const pageMin = config.pages.length * pagePrice[0];
  const pageMax = config.pages.length * pagePrice[1];
  if (config.pages.length) {
    items.push({ label: "Страницы", min: pageMin, max: pageMax });
  }
  const designMult = PRICES.designLevel[config.designLevel];
  const timelineMult = PRICES.timeline[config.timeline];
  const mult = designMult * timelineMult;
  const baseTotal = items.reduce((a, i) => a + i.min, 0);
  const baseTotalMax = items.reduce((a, i) => a + i.max, 0);
  items.push({
    label: `Коэф. дизайн × срочность (×${mult.toFixed(2)})`,
    min: Math.round(baseTotal * mult) - Math.round(baseTotal),
    max: Math.round(baseTotalMax * mult) - Math.round(baseTotalMax),
  });
  return items;
}

export type TimelineStage = { name: string; minWeeks: number; maxWeeks: number };

export function getTimelineStages(config: ProjectConfig): TimelineStage[] {
  const { minWeeks, maxWeeks } = calculateTimeline(config);
  const total = (minWeeks + maxWeeks) / 2;
  const analysis = 1;
  const designShare = config.designLevel === "base" ? 0.2 : config.designLevel === "custom" ? 0.35 : 0.4;
  const devShare = 1 - analysis / total - designShare;
  const designW = Math.max(1, Math.round(total * designShare));
  const devW = Math.max(1, Math.round(total * devShare));
  const test = 1;
  return [
    { name: "Анализ и ТЗ", minWeeks: analysis, maxWeeks: analysis },
    { name: "Дизайн", minWeeks: designW, maxWeeks: designW + 1 },
    { name: "Вёрстка и разработка", minWeeks: devW, maxWeeks: devW + 1 },
    { name: "Тестирование", minWeeks: test, maxWeeks: test },
  ];
}
