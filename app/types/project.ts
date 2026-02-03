/** Ответ AI: структура проекта из описания пользователя */
export type AIProjectStructure = {
  projectType: ProjectType;
  modules: string[];
  recommendedPages: string[];
  /** Русские названия страниц: id страницы → название на русском */
  pageLabels?: Record<string, string>;
  /** Русские названия модулей: id модуля → название на русском */
  moduleLabels?: Record<string, string>;
  complexity: "low" | "medium" | "high";
  explanation: Record<string, string>;
};

export type ProjectType =
  | "landing"
  | "corporate"
  | "web_app"
  | "crm"
  | "ecommerce"
  | "blog"
  | "catalog"
  | "saas"
  | "booking";

/** Конфигурация, выбранная пользователем (для расчёта цены) */
export type ProjectConfig = {
  projectType: ProjectType;
  pages: string[];
  modules: string[];
  designLevel: "base" | "custom" | "premium";
  timeline: "standard" | "urgent" | "express";
};

/** Расширенный бриф (контекст, детали) */
export type BriefState = {
  targetAudience: string; // B2B | B2C | mixed + описание
  referenceUrls: string[];
  contentSource: "client" | "studio" | "mixed";
  budgetPreference: "flexible" | "no_limit" | "up_to";
  budgetUpTo?: number;
  pagePriorities: Record<string, "primary" | "secondary">;
  mainPageBlocks: string[];
  /** Пользовательские блоки главной (добавленные через «Новый блок»). */
  customMainBlocks?: Array<{ id: string; label: string }>;
  designStyle: "minimalism" | "corporate" | "bright" | "creative" | "shop" | "premium";
  /** UX/интерактивность: simple_nav, animations, interactive, mobile */
  uxOptions?: string[];
  paymentMethods: string[];
  bookingType: "services" | "tables" | "rooms";
  integrations: string[];
  notificationChannels: string[];
  /** Комментарий пользователя (модалка «Комментарий») */
  comment?: string;
};

export const DEFAULT_BRIEF: BriefState = {
  targetAudience: "",
  referenceUrls: [],
  contentSource: "client",
  budgetPreference: "flexible",
  pagePriorities: {},
  mainPageBlocks: [],
  customMainBlocks: [],
  designStyle: "minimalism",
  uxOptions: [],
  paymentMethods: [],
  bookingType: "services",
  integrations: [],
  notificationChannels: ["email"],
  comment: "",
};

export type PriceRange = {
  min: number;
  max: number;
};

/** Модули и страницы с описаниями от AI */
export type ModuleWithExplanation = {
  id: string;
  label: string;
  explanation?: string;
  enabled: boolean;
};

export type PageWithExplanation = {
  id: string;
  label: string;
  explanation?: string;
  enabled: boolean;
};
