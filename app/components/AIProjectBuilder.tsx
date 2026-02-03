"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { analyzeProject, explainPrice, suggestPage, suggestModule, suggestMainBlock, getClarifyingQuestions, getStepClarifyingQuestions, refineStructure, getExamplePrompts, generateBrief, suggestRecommendations, getLaunchChecklist } from "@/app/actions/ai";
import { calculatePrice, calculateTimeline, getPriceBreakdown, getTimelineStages } from "@/app/lib/price-engine";
import type {
  AIProjectStructure,
  ProjectConfig,
  ProjectType,
  PriceRange,
  BriefState,
} from "@/app/types/project";
import { DEFAULT_BRIEF } from "@/app/types/project";

const STEPS = 9; // 2 = Дополнительно, 7 = Проверьте, 9 = Итог
const DRAFT_KEY = "lrx-builder-draft";
const CLARIFY_LENGTH = 80;
const FALLBACK_EXAMPLES = [
  "Интернет-магазин одежды с корзиной и оплатой онлайн",
  "Сайт бронирования столиков в ресторан",
  "Лендинг для стоматологии: услуги и запись на приём",
] as const;
const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  landing: "Лендинг / сайт услуг",
  corporate: "Корпоративный сайт",
  web_app: "Веб-приложение",
  crm: "CRM / внутренняя система",
  ecommerce: "Интернет-магазин",
  blog: "Блог / медиа",
  catalog: "Каталог товаров или услуг",
  saas: "SaaS-сервис",
  booking: "Сайт бронирования",
};
const TIMELINE_LABELS = {
  standard: "Стандарт",
  urgent: "Срочно",
  express: "Экспресс",
} as const;
const TIMELINE_DESCRIPTIONS: Record<keyof typeof TIMELINE_LABELS, string> = {
  standard: "Обычные сроки. Оптимально по цене и качеству.",
  urgent: "Ускоренная разработка. Цена выше на ~20%.",
  express: "Максимально быстро. Цена выше на ~40%.",
};

const TIMELINE_WHAT_MEANS: Record<keyof typeof TIMELINE_LABELS, string[]> = {
  standard: ["Планируемые этапы и дедлайны", "Оптимальная загрузка команды", "Резерв на согласования и правки"],
  urgent: ["Приоритет в очереди", "Ускоренные итерации", "Цена выше на ~20%"],
  express: ["Максимальный приоритет", "Параллельная работа по этапам", "Цена выше на ~40%"],
};

/** Минималистичное превью страницы (как выглядит страница) */
function PagePreviewThumb({ pageId, isExtra, explanation }: { pageId: string; isExtra: boolean; explanation?: string }) {
  const base = "bg-white/10 rounded";
  if (isExtra && explanation) {
    return (
      <div className="h-full w-full p-1.5 flex items-center justify-center">
        <span className="text-[10px] text-white/50 line-clamp-3 text-center leading-tight">{explanation}</span>
      </div>
    );
  }
  switch (pageId) {
    case "home":
      return (
        <div className="h-full w-full p-1 flex gap-1">
          <div className="flex-1 flex flex-col gap-0.5 justify-center min-w-0">
            <div className={`h-3 ${base} w-3/5`} />
            <div className={`h-1.5 ${base} w-4/5`} />
            <div className={`h-2 ${base} w-1/2 mt-0.5 rounded-full`} />
          </div>
          <div className={`w-2/5 shrink-0 h-full min-h-0 ${base} rounded`} />
        </div>
      );
    case "services":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-1 items-center">
              <div className={`w-2 h-2 ${base} rounded-full shrink-0`} />
              <div className={`h-2 ${base} flex-1`} />
            </div>
          ))}
          <div className="flex gap-0.5 mt-0.5">
            <div className={`flex-1 h-2.5 ${base} rounded`} />
            <div className={`flex-1 h-2.5 ${base} rounded`} />
          </div>
        </div>
      );
    case "contacts":
      return (
        <div className="h-full w-full p-1 flex">
          <div className="flex-1 flex flex-col gap-0.5">
            <div className={`h-1.5 ${base} w-full`} />
            <div className={`h-1.5 ${base} w-full`} />
            <div className={`h-3 ${base} w-full flex-1 min-h-0`} />
            <div className={`h-2 ${base} w-2/3 rounded-full`} />
          </div>
          <div className={`w-1/3 shrink-0 ml-0.5 ${base} rounded flex items-center justify-center`}>
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full" />
          </div>
        </div>
      );
    case "about":
      return (
        <div className="h-full w-full p-1 flex gap-1">
          <div className={`w-8 h-8 ${base} rounded-full shrink-0 self-center`} />
          <div className="flex-1 flex flex-col gap-0.5 justify-center min-w-0">
            <div className={`h-2 ${base} w-full`} />
            <div className={`h-1.5 ${base} w-4/5`} />
            <div className={`h-1.5 ${base} w-3/5`} />
          </div>
        </div>
      );
    case "catalog":
      return (
        <div className="h-full w-full p-1">
          <div className={`h-1.5 ${base} w-1/3 mb-0.5`} />
          <div className="grid grid-cols-3 gap-0.5 flex-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={`aspect-square ${base} border border-white/5 rounded`} />
            ))}
          </div>
        </div>
      );
    case "product":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          <div className={`flex-1 min-h-6 ${base} w-full rounded`} />
          <div className={`h-2 ${base} w-full`} />
          <div className="flex justify-between items-center">
            <div className={`h-1.5 ${base} w-1/4`} />
            <div className={`h-2 ${base} w-1/3 rounded-full`} />
          </div>
        </div>
      );
    case "cart":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-0.5 items-center">
              <div className="w-4 h-4 bg-white/15 rounded shrink-0" />
              <div className={`h-1.5 ${base} flex-1`} />
              <div className={`w-3 h-1.5 ${base} rounded`} />
            </div>
          ))}
          <div className={`h-2 ${base} w-full mt-auto rounded flex items-center justify-end pr-0.5`}>
            <div className="h-1.5 bg-white/20 w-1/3 rounded" />
          </div>
        </div>
      );
    case "checkout":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          <div className="flex gap-0.5 mb-0.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex-1 h-1 ${base} rounded-full`} />
            ))}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-2 ${base} w-full`} />
          ))}
        </div>
      );
    case "account":
      return (
        <div className="h-full w-full p-1 flex gap-0.5">
          <div className="w-1/4 flex flex-col gap-0.5">
            <div className={`h-2 ${base} rounded w-full`} />
            <div className={`h-2 ${base} rounded w-full`} />
            <div className={`h-2 ${base} rounded w-2/3`} />
          </div>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className={`h-4 ${base} w-full rounded`} />
            <div className={`h-2 ${base} w-full`} />
          </div>
        </div>
      );
    case "faq":
      return (
        <div className="h-full w-full p-1 flex gap-1">
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <div className={`h-2.5 ${base} w-full rounded shrink-0`} />
            <div className={`flex-1 min-h-0 ${base} w-full rounded`} />
          </div>
          <div className="w-2/5 shrink-0 flex flex-col gap-0.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-2 ${base} rounded w-full shrink-0`} />
            ))}
          </div>
        </div>
      );
    case "pricing":
      return (
        <div className="h-full w-full p-1 flex gap-0.5 items-end">
          <div className={`flex-1 h-8 ${base} rounded`} />
          <div className={`flex-1 h-10 ${base} rounded`} />
          <div className={`flex-1 h-8 ${base} rounded`} />
        </div>
      );
    case "team":
      return (
        <div className="h-full w-full p-1 grid grid-cols-3 gap-0.5 content-center">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div className={`w-5 h-5 ${base} rounded-full`} />
              <div className={`h-1 ${base} w-full rounded`} />
            </div>
          ))}
        </div>
      );
    case "portfolio":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5 items-center">
          <div className={`h-2 ${base} w-2/3 rounded self-center shrink-0`} />
          <div className="flex-1 w-full flex gap-0.5 min-h-0">
            <div className={`flex-1 ${base} rounded min-w-0 aspect-square max-h-full`} />
            <div className={`flex-1 ${base} rounded min-w-0 aspect-square max-h-full`} />
            <div className={`flex-1 ${base} rounded min-w-0 aspect-square max-h-full`} />
          </div>
        </div>
      );
    case "cases":
      return (
        <div className="h-full w-full p-1 grid grid-cols-2 gap-0.5">
          <div className={`${base} rounded col-span-2 aspect-[2/1]`} />
          <div className={`${base} rounded aspect-square`} />
          <div className={`${base} rounded aspect-square`} />
        </div>
      );
    case "blog":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          <div className={`h-2.5 ${base} w-full rounded`} />
          <div className={`h-1 ${base} w-2/3`} />
          <div className={`h-1.5 ${base} w-full`} />
          <div className="flex gap-0.5 mt-auto">
            <div className={`h-1 ${base} w-6 rounded-full`} />
            <div className={`h-1 ${base} w-8`} />
          </div>
        </div>
      );
    case "booking_form":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          <div className="grid grid-cols-7 gap-px flex-1 min-h-0">
            {Array.from({ length: 21 }).map((_, i) => (
              <div key={i} className="bg-white/10 rounded-sm min-h-0" />
            ))}
          </div>
          <div className={`h-2 ${base} w-full rounded mt-0.5`} />
        </div>
      );
    case "reviews":
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          {[1, 2].map((i) => (
            <div key={i} className={`flex gap-0.5 items-start ${base} rounded p-0.5`}>
              <div className="flex gap-px">
                {[1, 2, 3, 4, 5].map((j) => (
                  <span key={j} className="w-1 h-1 bg-white/50 rounded-full" />
                ))}
              </div>
              <div className={`h-2 flex-1 ${base} rounded min-w-0`} />
            </div>
          ))}
        </div>
      );
    case "contacts_map":
      return (
        <div className="h-full w-full p-1 flex flex-col">
          <div className={`flex-1 min-h-0 ${base} w-full rounded relative overflow-hidden`}>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/70 rounded-full ring-2 ring-white/30" />
          </div>
          <div className={`h-2 ${base} w-full mt-0.5 rounded flex items-center gap-0.5`}>
            <span className="w-1 h-1 bg-white/40 rounded-full shrink-0" />
            <div className={`h-1 flex-1 ${base} rounded`} />
          </div>
        </div>
      );
    default:
      return (
        <div className="h-full w-full p-1 flex flex-col gap-0.5">
          <div className={`h-3 ${base} w-full`} />
          <div className={`h-2 ${base} w-full`} />
          <div className={`h-2 ${base} w-4/5`} />
        </div>
      );
  }
}

/** Подстановочные описания модулей, если ИИ не вернул explanation */
const MODULE_FALLBACK_EXPLANATIONS: Record<string, string> = {
  auth: "Вход и регистрация пользователей, восстановление пароля.",
  user_dashboard: "Личный кабинет: заказы, профиль, настройки.",
  admin_panel: "Панель управления контентом и настройками сайта.",
  payments: "Приём оплаты: карты, СБП, рассрочка, платёжные системы.",
  forms: "Формы заявок, обратной связи, подписки.",
  integrations: "Интеграции с CRM, 1С, почтой, аналитикой.",
  calculator: "Калькулятор стоимости, расчёты для пользователя.",
  multilang: "Поддержка нескольких языков интерфейса.",
  reviews: "Отзывы и рейтинги товаров или услуг.",
  search: "Поиск по каталогу, фильтры, подсказки.",
  notifications: "Уведомления: email, Telegram, push; рассылки.",
  chat: "Онлайн-чат или виджет обратной связи.",
  booking_calendar: "Календарь и слоты для записи и бронирования.",
  subscriptions: "Подписки и рекуррентные платежи.",
  analytics: "Дашборды, отчёты, статистика для владельца.",
  export: "Выгрузка данных в Excel, CSV и т.п.",
};

/** Русские названия страниц для отображения пользователю (id → подпись) */
const PAGE_LABELS_RU: Record<string, string> = {
  home: "Главная",
  services: "Услуги",
  cases: "Кейсы",
  contacts: "Контакты",
  about: "О компании",
  catalog: "Каталог",
  cart: "Корзина",
  faq: "Вопросы и ответы",
  pricing: "Цены",
  team: "Команда",
  portfolio: "Портфолио",
  blog: "Блог",
  product: "Карточка товара / услуги",
  checkout: "Оформление заказа",
  account: "Личный кабинет",
  booking_form: "Запись / бронирование",
  reviews: "Отзывы",
  contacts_map: "Контакты и карта",
  page_contacts: "Контакты",
  page_about: "О компании",
  page_home: "Главная",
  page_services: "Услуги",
  page_catalog: "Каталог",
  delivery: "Доставка",
  privacy_policy: "Политика конфиденциальности",
  guarantees: "Гарантии",
};

/** Русские названия модулей для отображения пользователю (id → подпись) */
const MODULE_LABELS_RU: Record<string, string> = {
  auth: "Вход и регистрация",
  user_dashboard: "Личный кабинет",
  admin_panel: "Админ-панель",
  payments: "Оплата",
  forms: "Формы заявок",
  integrations: "Интеграции",
  calculator: "Калькулятор",
  multilang: "Многоязычность",
  reviews: "Отзывы",
  search: "Поиск",
  notifications: "Уведомления",
  chat: "Чат",
  booking_calendar: "Календарь записи",
  subscriptions: "Подписки",
  analytics: "Аналитика",
  export: "Выгрузка данных",
  module_forms: "Формы заявок",
  module_service_details: "Детали услуг",
  module_team_members: "Команда",
  module_payments: "Оплата",
  module_search: "Поиск",
};

const MAIN_PAGE_BLOCKS = [
  { id: "hero", label: "Герой (баннер)" },
  { id: "advantages", label: "Преимущества" },
  { id: "services", label: "Услуги" },
  { id: "cases", label: "Кейсы" },
  { id: "reviews", label: "Отзывы" },
  { id: "form", label: "Форма заявки" },
  { id: "map", label: "Карта" },
  { id: "social", label: "Соцсети" },
] as const;
const DESIGN_STYLE_LABELS: Record<string, string> = {
  minimalism: "Минимализм",
  corporate: "Корпоративный",
  bright: "Яркий",
  creative: "Креативный",
  shop: "Магазин",
  premium: "Премиум",
};
const DESIGN_STYLE_PREVIEW: Record<string, string> = {
  minimalism: "Минимум элементов, много воздуха",
  corporate: "Строгий, деловой стиль",
  bright: "Яркие акценты, выразительность",
  creative: "Нестандартная подача, креатив",
  shop: "Каталог, карточки товаров",
  premium: "Лакшери, премиальная подача",
};
const UX_OPTIONS = [
  { id: "simple_nav", label: "Простая навигация" },
  { id: "animations", label: "Анимации" },
  { id: "interactive", label: "Интерактивные элементы" },
  { id: "mobile", label: "Мобильная адаптация" },
] as const;
const PAYMENT_METHODS = [
  { id: "card", label: "Банковские карты" },
  { id: "sbp", label: "СБП" },
  { id: "installments", label: "Рассрочка" },
  { id: "yookassa", label: "ЮKassa" },
  { id: "robokassa", label: "Robokassa" },
] as const;
const BOOKING_TYPES = [
  { id: "services", label: "Запись на услуги" },
  { id: "tables", label: "Бронирование столиков" },
  { id: "rooms", label: "Бронирование номеров" },
] as const;
const INTEGRATIONS_LIST = [
  { id: "1c", label: "1С" },
  { id: "amo", label: "AmoCRM" },
  { id: "bitrix24", label: "Bitrix24" },
  { id: "unisender", label: "Unisender" },
  { id: "sendpulse", label: "SendPulse" },
  { id: "yandex", label: "Яндекс.Метрика" },
  { id: "ga4", label: "Google Analytics 4" },
] as const;
const NOTIFICATION_CHANNELS_LIST = [
  { id: "email", label: "Email" },
  { id: "telegram", label: "Telegram-бот" },
  { id: "crm", label: "CRM" },
] as const;
const defaultConfig = (): ProjectConfig => ({
  projectType: "landing",
  pages: [],
  modules: [],
  designLevel: "base",
  timeline: "standard",
});

function buildConfigFromAI(ai: AIProjectStructure): ProjectConfig {
  return {
    projectType: ai.projectType,
    pages: ai.recommendedPages,
    modules: ai.modules,
    designLevel: "base",
    timeline: "standard",
  };
}

export default function AIProjectBuilder() {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [aiStructure, setAiStructure] = useState<AIProjectStructure | null>(null);
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [extraPages, setExtraPages] = useState<Array<{ id: string; label: string; explanation?: string }>>([]);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [newPageText, setNewPageText] = useState("");
  const [addPageLoading, setAddPageLoading] = useState(false);
  const [addPageError, setAddPageError] = useState<string | null>(null);
  const [extraModules, setExtraModules] = useState<Array<{ id: string; label: string; explanation?: string }>>([]);
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModuleText, setNewModuleText] = useState("");
  const [addModuleLoading, setAddModuleLoading] = useState(false);
  const [addModuleError, setAddModuleError] = useState<string | null>(null);
  const [showClarification, setShowClarification] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<number, boolean>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [noPagesWarning, setNoPagesWarning] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "" });
  const [showLeadFormModal, setShowLeadFormModal] = useState(false);
  const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);
  const [examplePromptsLoading, setExamplePromptsLoading] = useState(true);
  const [openTimelineAccordion, setOpenTimelineAccordion] = useState<keyof typeof TIMELINE_LABELS | null>(null);
  const [brief, setBrief] = useState<BriefState>(() => DEFAULT_BRIEF);
  const [draftRestored, setDraftRestored] = useState(false);
  const [recommendations, setRecommendations] = useState<{ pages: string[]; modules: string[]; reason: string } | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [launchChecklist, setLaunchChecklist] = useState<string[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [showStepClarifyModal, setShowStepClarifyModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showMainBlocksModal, setShowMainBlocksModal] = useState(false);
  const [stepClarifyQuestions, setStepClarifyQuestions] = useState<string[]>([]);
  const [stepClarifyAnswers, setStepClarifyAnswers] = useState<Record<number, boolean>>({});
  const [stepClarifyLoading, setStepClarifyLoading] = useState(false);
  /** Кэш вопросов и ответов по шагам; при закрытии модалки сохраняем сюда */
  const [stepClarifyCache, setStepClarifyCache] = useState<Record<number, { questions: string[]; answers: Record<number, boolean> }>>({});
  /** Отпечаток данных шага — при совпадении не запрашиваем новые вопросы */
  const [stepClarifyFingerprint, setStepClarifyFingerprint] = useState<Record<number, string>>({});
  const [isAddingMainBlock, setIsAddingMainBlock] = useState(false);
  const [newMainBlockText, setNewMainBlockText] = useState("");
  const [addMainBlockLoading, setAddMainBlockLoading] = useState(false);
  const [addMainBlockError, setAddMainBlockError] = useState<string | null>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    setExamplePromptsLoading(true);
    getExamplePrompts().then(({ data }) => {
      if (!cancelled && data?.length) {
        setExamplePrompts(data);
      } else if (!cancelled) {
        setExamplePrompts([...FALLBACK_EXAMPLES]);
      }
      if (!cancelled) setExamplePromptsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draftRestored) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { description?: string; config?: ProjectConfig; step?: number; brief?: BriefState; extraPages?: typeof extraPages; extraModules?: typeof extraModules; aiStructure?: AIProjectStructure; stepClarifyCache?: Record<number, { questions: string[]; answers: Record<number, boolean> }>; stepClarifyFingerprint?: Record<number, string> };
        if (data.description !== undefined) setDescription(data.description);
        if (data.config) setConfig(data.config);
        if (data.brief) setBrief(data.brief);
        if (data.extraPages?.length) setExtraPages(data.extraPages);
        if (data.extraModules?.length) setExtraModules(data.extraModules);
        if (data.aiStructure) setAiStructure(data.aiStructure);
        if (data.step != null && data.step >= 1 && data.step <= STEPS) setStep(data.step);
        if (data.stepClarifyCache && typeof data.stepClarifyCache === "object") setStepClarifyCache(data.stepClarifyCache);
        if (data.stepClarifyFingerprint && typeof data.stepClarifyFingerprint === "object") setStepClarifyFingerprint(data.stepClarifyFingerprint);
      }
      setDraftRestored(true);
    } catch {
      setDraftRestored(true);
    }
  }, [draftRestored]);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      const payload = {
        description,
        config,
        step,
        brief,
        extraPages,
        extraModules,
        aiStructure: aiStructure ?? undefined,
        stepClarifyCache,
        stepClarifyFingerprint,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [description, config, step, brief, extraPages, extraModules, aiStructure, draftRestored, stepClarifyCache, stepClarifyFingerprint]);

  const isRateLimited = rateLimitUntil > Date.now();
  const tryConsumeRateLimit = useCallback(() => {
    const now = Date.now();
    if (rateLimitUntil > now) return false;
    setRequestTimestamps((prev) => {
      const next = [...prev.filter((t) => now - t < 60000), now];
      if (next.length >= 5 && next[next.length - 1] - next[0] < 60000) {
        setRateLimitUntil(now + 60000);
        return next.slice(-5);
      }
      return next;
    });
    return true;
  }, [rateLimitUntil]);

  const priceRange = useMemo(() => calculatePrice(config), [config]);
  const timelineWeeks = useMemo(() => calculateTimeline(config), [config]);

  const handleAnalyze = useCallback(async () => {
    if (!description.trim() || description.trim().length < 10) {
      setError("Опишите проект подробнее (минимум 10 символов)");
      return;
    }
    if (isRateLimited) return;
    if (!tryConsumeRateLimit()) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await analyzeProject(description);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (data) {
      setAiStructure(data);
      setConfig((prev) => {
        const fromAI = buildConfigFromAI(data);
        if (prev.pages.length || prev.modules.length) {
          return { ...fromAI, pages: prev.pages, modules: prev.modules };
        }
        return fromAI;
      });
      if (description.trim().length < CLARIFY_LENGTH) {
        const { data: questions } = await getClarifyingQuestions(description);
        if (questions?.length) {
          setClarificationQuestions(questions);
          setClarificationAnswers({});
          setShowClarification(true);
          return;
        }
      }
      setStep(2);
    }
  }, [description, isRateLimited, tryConsumeRateLimit]);

  const updateConfig = useCallback((patch: Partial<ProjectConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const togglePage = useCallback((pageId: string) => {
    setConfig((prev) => {
      const pages = prev.pages.includes(pageId)
        ? prev.pages.filter((p) => p !== pageId)
        : [...prev.pages, pageId];
      return { ...prev, pages };
    });
  }, []);

  const toggleModule = useCallback((moduleId: string) => {
    setConfig((prev) => {
      const modules = prev.modules.includes(moduleId)
        ? prev.modules.filter((m) => m !== moduleId)
        : [...prev.modules, moduleId];
      return { ...prev, modules };
    });
  }, []);

  const removeExtraPage = useCallback((pageId: string) => {
    setExtraPages((prev) => prev.filter((p) => p.id !== pageId));
    setConfig((prev) => ({ ...prev, pages: prev.pages.filter((p) => p !== pageId) }));
  }, []);

  const removeExtraModule = useCallback((moduleId: string) => {
    setExtraModules((prev) => prev.filter((m) => m.id !== moduleId));
    setConfig((prev) => ({ ...prev, modules: prev.modules.filter((m) => m !== moduleId) }));
  }, []);

  const handleAddMainBlock = useCallback(async () => {
    const text = newMainBlockText.trim();
    if (!text || addMainBlockLoading) return;
    if (isRateLimited) return;
    tryConsumeRateLimit();
    setAddMainBlockError(null);
    setAddMainBlockLoading(true);
    const { data, error } = await suggestMainBlock(text);
    setAddMainBlockLoading(false);
    if (error) {
      setAddMainBlockError(error);
      return;
    }
    if (data) {
      setBrief((b) => ({
        ...b,
        customMainBlocks: [...(b.customMainBlocks ?? []), { id: data.id, label: data.label }],
        mainPageBlocks: [...b.mainPageBlocks, data.id],
      }));
      setNewMainBlockText("");
      setIsAddingMainBlock(false);
    }
  }, [newMainBlockText, addMainBlockLoading, isRateLimited, tryConsumeRateLimit]);

  const removeMainBlock = useCallback((blockId: string) => {
    setBrief((b) => ({
      ...b,
      customMainBlocks: (b.customMainBlocks ?? []).filter((c) => c.id !== blockId),
      mainPageBlocks: b.mainPageBlocks.filter((x) => x !== blockId),
    }));
  }, []);

  const handleClarifySubmit = useCallback(async () => {
    if (!aiStructure || clarifyLoading) return;
    setClarifyLoading(true);
    const add = await refineStructure(description, clarificationAnswers);
    setClarifyLoading(false);
    setAiStructure((prev) => {
      if (!prev) return prev;
      const pages = [...new Set([...prev.recommendedPages, ...add.addPages])];
      const modules = [...new Set([...prev.modules, ...add.addModules])];
      return {
        ...prev,
        recommendedPages: pages,
        modules,
        pageLabels: { ...prev.pageLabels, ...add.pageLabels },
        moduleLabels: { ...prev.moduleLabels, ...add.moduleLabels },
        explanation: { ...prev.explanation, ...add.explanation },
      };
    });
    setConfig((prev) => ({
      ...prev,
      pages: [...new Set([...prev.pages, ...add.addPages])],
      modules: [...new Set([...prev.modules, ...add.addModules])],
    }));
    setShowClarification(false);
    setStep(2);
  }, [aiStructure, description, clarificationAnswers, clarifyLoading]);

  const handleAddPage = useCallback(async () => {
    const text = newPageText.trim();
    if (!text || addPageLoading || !aiStructure) return;
    if (isRateLimited) return;
    tryConsumeRateLimit();
    setAddPageError(null);
    setAddPageLoading(true);
    const { data, error } = await suggestPage(text);
    setAddPageLoading(false);
    if (error) {
      setAddPageError(error);
      return;
    }
    if (data) {
      if (aiStructure.recommendedPages.includes(data.id)) {
        setConfig((prev) =>
          prev.pages.includes(data.id) ? prev : { ...prev, pages: [...prev.pages, data.id] }
        );
      } else {
        setExtraPages((prev) => [...prev, { id: data.id, label: data.label, explanation: data.explanation }]);
        setConfig((prev) => ({ ...prev, pages: [...prev.pages, data.id] }));
      }
      setNewPageText("");
      setIsAddingPage(false);
    }
  }, [newPageText, addPageLoading, aiStructure, isRateLimited, tryConsumeRateLimit]);

  const handleAddModule = useCallback(async () => {
    const text = newModuleText.trim();
    if (!text || addModuleLoading || !aiStructure) return;
    if (isRateLimited) return;
    tryConsumeRateLimit();
    setAddModuleError(null);
    setAddModuleLoading(true);
    const { data, error } = await suggestModule(text);
    setAddModuleLoading(false);
    if (error) {
      setAddModuleError(error);
      return;
    }
    if (data) {
      if (aiStructure.modules.includes(data.id)) {
        setConfig((prev) =>
          prev.modules.includes(data.id) ? prev : { ...prev, modules: [...prev.modules, data.id] }
        );
      } else {
        setExtraModules((prev) => [...prev, { id: data.id, label: data.label, explanation: data.explanation }]);
        setConfig((prev) => ({ ...prev, modules: [...prev.modules, data.id] }));
      }
      setNewModuleText("");
      setIsAddingModule(false);
    }
  }, [newModuleText, addModuleLoading, aiStructure, isRateLimited, tryConsumeRateLimit]);

  const handleExplainPrice = useCallback(async () => {
    setExplainLoading(true);
    setExplainText(null);
    const { text } = await explainPrice(config, priceRange);
    setExplainLoading(false);
    if (text) setExplainText(text);
  }, [config, priceRange]);

  const canNext = step < STEPS;
  const canPrev = step > 1;

  const getStepFingerprint = useCallback((s: number) => {
    if (s === 2) return brief.referenceUrls.join("|");
    if (s === 3 || s === 4) return [...config.pages].sort().join(",");
    if (s === 5) return [...config.modules].sort().join(",");
    if (s === 6) return `${brief.designStyle};${(brief.uxOptions ?? []).sort().join(",")}`;
    if (s === 7) return config.timeline;
    return "";
  }, [brief.targetAudience, brief.referenceUrls, brief.contentSource, brief.budgetPreference, brief.budgetUpTo, brief.designStyle, config.pages, config.modules, config.timeline]);

  const handleStepClarifyClick = useCallback(async () => {
    if (step < 2 || step > 7 || stepClarifyLoading) return;
    const fingerprint = getStepFingerprint(step);
    const cached = stepClarifyCache[step];
    const fingerprintMatch = stepClarifyFingerprint[step] === fingerprint;

    if (cached?.questions?.length && fingerprintMatch) {
      setStepClarifyQuestions(cached.questions);
      setStepClarifyAnswers(cached.answers ?? {});
      setShowStepClarifyModal(true);
      return;
    }

    setStepClarifyLoading(true);
    setStepClarifyQuestions([]);
    setStepClarifyAnswers({});
    const previousCache = cached;
    const { data: questions } = await getStepClarifyingQuestions(step, description, config);
    setStepClarifyLoading(false);

    if (questions?.length) {
      const prevSelected = previousCache ? previousCache.questions.filter((_, i) => previousCache.answers[i]) : [];
      const mergedQuestions = [...questions];
      const mergedAnswers: Record<number, boolean> = {};
      questions.forEach((q, i) => {
        mergedAnswers[i] = prevSelected.includes(q);
      });
      prevSelected.forEach((text) => {
        if (!mergedQuestions.includes(text)) {
          mergedQuestions.push(text);
          mergedAnswers[mergedQuestions.length - 1] = true;
        }
      });
      setStepClarifyQuestions(mergedQuestions);
      setStepClarifyAnswers(mergedAnswers);
      setStepClarifyCache((prev) => ({ ...prev, [step]: { questions: mergedQuestions, answers: mergedAnswers } }));
      setStepClarifyFingerprint((prev) => ({ ...prev, [step]: fingerprint }));
      setShowStepClarifyModal(true);
    } else if (cached?.questions?.length) {
      setStepClarifyQuestions(cached.questions);
      setStepClarifyAnswers(cached.answers ?? {});
      setShowStepClarifyModal(true);
    }
  }, [step, description, config, stepClarifyLoading, getStepFingerprint, stepClarifyCache, stepClarifyFingerprint]);

  const handleStepClarifyClose = useCallback(() => {
    setStepClarifyCache((prev) => ({ ...prev, [step]: { questions: stepClarifyQuestions, answers: stepClarifyAnswers } }));
    setStepClarifyFingerprint((prev) => ({ ...prev, [step]: getStepFingerprint(step) }));
    setShowStepClarifyModal(false);
  }, [step, stepClarifyQuestions, stepClarifyAnswers, getStepFingerprint]);

  const stepTitleClass = "text-2xl sm:text-5xl font-semibold tracking-tight text-white";
  const stepSubtitleClass = "mt-3 text-sm text-white/55";
  const btnPrimary = "rounded-full bg-white px-6 py-3 text-[#0F0F0F] font-semibold text-sm transition hover:bg-white/90 disabled:opacity-50";
  const btnSecondary = "rounded-full border border-white/25 px-6 py-3 text-white/90 text-sm font-medium transition hover:bg-white/10";

  const handleReset = useCallback(() => {
    setStep(1);
    setDescription("");
    setAiStructure(null);
    setConfig(defaultConfig());
    setBrief(DEFAULT_BRIEF);
    setExtraPages([]);
    setExtraModules([]);
    setShowClarification(false);
    setClarificationQuestions([]);
    setClarificationAnswers({});
    setNoPagesWarning(false);
    setExplainText(null);
    setStepClarifyCache({});
    setStepClarifyFingerprint({});
    setShowStepClarifyModal(false);
    setStepClarifyQuestions([]);
    setStepClarifyAnswers({});
    setIsAddingPage(false);
    setNewPageText("");
    setAddPageError(null);
    setIsAddingModule(false);
    setNewModuleText("");
    setAddModuleError(null);
    setIsAddingMainBlock(false);
    setNewMainBlockText("");
    setAddMainBlockError(null);
    setOpenTimelineAccordion(null);
    setRecommendations(null);
    setBriefText(null);
    setBriefError(null);
    setLaunchChecklist([]);
    setShowPriceModal(false);
    setShowBriefModal(false);
    setShowChecklistModal(false);
    setShowRecommendationsModal(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const stepTitle =
    step === 1 && !showClarification
      ? "Опишите, какой сайт или сервис вы хотите"
      : step === 1 && showClarification
        ? "Отметьте детали проекта, которые вы хотите включить"
        : step === 2
          ? "Ваши референсы"
          : step === 3
            ? "Тип проекта"
            : step === 4
              ? "Структура сайта"
              : step === 5
                ? "Функционал"
                : step === 6
                  ? "Дизайн и UX"
                  : step === 7
                    ? "Сроки"
                    : step === 8
                      ? "Проверьте перед отправкой"
                      : step === 9
                        ? "Итог"
                        : "";

  return (
    <div className={`w-full ${step >= 1 && step <= 7 ? "max-w-none" : ""}`}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className={stepTitleClass}>
          {stepTitle}
        </h2>
        <button
          type="button"
          onClick={handleReset}
          className="cursor-pointer text-sm text-white/50 hover:text-white/80 transition shrink-0"
        >
          Сбросить конструктор
        </button>
      </div>
      {/* Экран 1: Описание */}
      {step === 1 && !showClarification && (
        <div key="step1" className="animate-fade animate-step">
          <div className="mt-6 w-full">
            <div
              ref={mirrorRef}
              className={`align-top max-w-full ${description.trim() ? "inline-block" : "block w-full"}`}
            >
              <div
                className={`relative text-3xl font-light py-3 pr-4 min-h-[4.5rem] ${description.trim() ? "inline-block max-w-full" : "block w-full"}`}
                style={{ wordBreak: "break-word" }}
              >
                <span
                  aria-hidden
                  className="invisible whitespace-pre-wrap block w-full"
                >
                  {description || " "}
                </span>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Введите текст..."
                  rows={1}
                  className="absolute inset-0 w-full h-full text-3xl font-light resize-none rounded-none border-0 border-transparent bg-transparent p-0 py-3 pr-4 text-white placeholder:text-white/40 outline-none focus:ring-0 overflow-hidden"
                  disabled={loading}
                />
              </div>
              <div
                className={`flex justify-end transition-all duration-300 ease-out ${
                  description.trim().length >= 5
                    ? "mt-1 ml-20 opacity-100 translate-y-0"
                    : "mt-0 h-0 opacity-0 translate-y-2 overflow-hidden pointer-events-none"
                }`}
              >
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading || description.trim().length < 10 || isRateLimited}
                  className="cursor-pointer rounded-full bg-white px-8 py-4 text-base font-semibold text-[#0F0F0F] transition hover:bg-white/90 disabled:opacity-50 shrink-0"
                >
                  {loading ? "AI анализирует…" : isRateLimited ? "Подождите 1 мин" : "AI собрать проект"}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {examplePromptsLoading ? (
              <span className="text-sm text-white/40">Загрузка примеров…</span>
            ) : (
              (examplePrompts.length ? examplePrompts : [...FALLBACK_EXAMPLES]).map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setDescription(text)}
                  className="cursor-pointer rounded-full bg-[#1A1A1A] px-4 py-4 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
                >
                  {text.length > 45 ? text.slice(0, 45) + "…" : text}
                </button>
              ))
            )}
          </div>
          {error && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                type="button"
                onClick={() => { setError(null); handleAnalyze(); }}
                className="rounded-full border border-red-400/50 px-4 py-2 text-sm text-red-300 hover:bg-red-400/10"
              >
                Попробовать снова
              </button>
            </div>
          )}
        </div>
      )}

      {/* Экран 2: Ваши референсы */}
      {step === 2 && (
        <div key="step2" className="animate-fade animate-step">
          <div className="mt-8 space-y-4">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="url"
                placeholder="https://..."
                value={brief.referenceUrls[i] ?? ""}
                onChange={(e) => {
                  const next = [...(brief.referenceUrls || [])];
                  next[i] = e.target.value.trim();
                  setBrief((b) => ({ ...b, referenceUrls: next.filter(Boolean) }));
                }}
                className="w-full text-3xl font-light bg-transparent border-0 outline-none text-white placeholder:text-white/40 py-2"
              />
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3 items-center">
            {step === 2 && (
              <button type="button" onClick={() => setShowCommentModal(true)} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10">
                Комментарий
              </button>
            )}
            <button type="button" onClick={() => { if (clarificationQuestions.length > 0) setShowClarification(true); setStep(1); }} className={`cursor-pointer ${btnSecondary}`}>Назад</button>
            <button type="button" onClick={() => setStep(3)} className={`cursor-pointer ${btnSecondary}`}>Пропустить</button>
            <button type="button" onClick={() => setStep(3)} className={`cursor-pointer ${btnPrimary}`}>Далее</button>
          </div>
        </div>
      )}

      {/* Уточняющие вопросы (после короткого описания) */}
      {step === 1 && showClarification && aiStructure && (
        <div key="clarify" className="animate-fade animate-step">
          <div className="mt-10 max-w-2xl">
          <ul className="space-y-3">
            {clarificationQuestions.map((q, i) => {
              const isSelected = !!clarificationAnswers[i];
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setClarificationAnswers((prev) => ({ ...prev, [i]: !prev[i] }))}
                    className="w-full cursor-pointer rounded-xl px-5 py-4 text-left transition hover:bg-white/10"
                    style={{
                      background: isSelected ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                      border: isSelected ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.1)",
                    }}
                    aria-pressed={isSelected}
                  >
                    <span className={`font-medium ${isSelected ? "text-white" : "text-white/70"}`}>{q}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => setShowClarification(false)} className={`cursor-pointer ${btnSecondary}`}>
              Назад
            </button>
            <button type="button" onClick={() => { setShowClarification(false); setStep(2); }} className={`cursor-pointer ${btnSecondary}`}>
              Пропустить
            </button>
            <button type="button" onClick={handleClarifySubmit} disabled={clarifyLoading} className={`cursor-pointer ${btnPrimary}`}>
              {clarifyLoading ? "Применяю…" : "Далее"}
            </button>
          </div>
        </div>
      )}

      {/* Экран 3: Тип проекта */}
      {step === 3 && aiStructure && (
        <div key="step3" className="animate-fade animate-step">
          <p className={stepSubtitleClass}>Рекомендация по описанию — можно изменить.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => updateConfig({ projectType: type })}
                className={`cursor-pointer rounded-full px-6 py-3 text-base font-medium transition ${
                  config.projectType === type
                    ? "bg-white text-[#0F0F0F]"
                    : "bg-white/10 text-white hover:bg-white/20"
                } ${aiStructure.projectType === type ? "ring-2 ring-white/50" : ""}`}
              >
                {PROJECT_TYPE_LABELS[type]}
                {aiStructure.projectType === type && " ✓"}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3 items-center">
            {step >= 3 && step <= 7 && (
              <button type="button" onClick={handleStepClarifyClick} disabled={stepClarifyLoading} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
                {stepClarifyLoading ? "Загрузка…" : "Уточнить детали"}
              </button>
            )}
            {canPrev && (
              <button type="button" onClick={() => setStep(2)} className={`cursor-pointer ${btnSecondary}`}>
                Назад
              </button>
            )}
            {canNext && (
              <button type="button" onClick={() => setStep(4)} className={`cursor-pointer ${btnPrimary}`}>
                Далее
              </button>
            )}
          </div>
        </div>
      )}

      {/* Экран 4: Структура страниц */}
      {step === 4 && aiStructure && (
        <div key="step4" className="animate-fade animate-step">
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              ...aiStructure.recommendedPages.map((pageId) => ({ id: pageId, label: aiStructure.pageLabels?.[pageId] ?? PAGE_LABELS_RU[pageId] ?? (pageId.charAt(0).toUpperCase() + pageId.slice(1).replace(/_/g, " ")), explanation: aiStructure.explanation[pageId], isExtra: false })),
              ...extraPages.filter((ep) => !aiStructure.recommendedPages.includes(ep.id)).map((ep) => ({ id: ep.id, label: ep.label, explanation: ep.explanation, isExtra: true })),
            ].map(({ id: pageId, label: name, explanation: expl, isExtra }) => {
              const isChecked = config.pages.includes(pageId);
              return (
                <div
                  key={pageId}
                  role="button"
                  tabIndex={0}
                  onClick={() => togglePage(pageId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePage(pageId);
                    }
                  }}
                  className={`cursor-pointer rounded-xl overflow-hidden transition border-2 text-left ${isChecked ? "border-white/50 bg-white/10" : "border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/8"}`}
                  aria-pressed={isChecked}
                  aria-label={`${name}, ${isChecked ? "включено" : "выключено"}`}
                >
                  <div className="h-20 bg-[#0F0F0F]/80 flex items-stretch justify-center overflow-hidden p-2" aria-hidden>
                    <PagePreviewThumb pageId={pageId} isExtra={isExtra} />
                  </div>
                  <div className="p-3 relative">
                    <span className="absolute top-2 right-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-current" style={{ borderColor: isChecked ? "#fff" : "rgba(255,255,255,0.4)", background: isChecked ? "#fff" : "transparent" }} aria-hidden>
                      {isChecked && (
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="text-[#0F0F0F]">
                          <path d="M2 5l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 pr-7 min-w-0">
                      <span className="font-medium text-white truncate">{name}</span>
                      {pageId === "home" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowMainBlocksModal(true); }}
                          className="shrink-0 p-1 rounded-md text-white/60 hover:text-white hover:bg-white/15 transition"
                          title="Блоки на главной"
                          aria-label="Блоки на главной"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="5" height="5" rx="0.5" />
                            <rect x="9" y="2" width="5" height="5" rx="0.5" />
                            <rect x="2" y="9" width="5" height="5" rx="0.5" />
                            <rect x="9" y="9" width="5" height="5" rx="0.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {isExtra && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeExtraPage(pageId); }}
                        className="mt-2 text-xs text-white/50 hover:text-white hover:bg-white/10 rounded px-2 py-1 transition"
                        aria-label={`Удалить ${name}`}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Карточка «добавить страницу» */}
            <div className="rounded-xl border-2 border-dashed border-white/35 bg-white/[0.03] overflow-hidden min-h-[140px] flex flex-col">
              {!isAddingPage ? (
                <button
                  type="button"
                  onClick={() => setIsAddingPage(true)}
                  className="flex flex-1 min-h-[140px] w-full cursor-pointer items-center justify-center text-white/60 hover:text-white/80 hover:bg-white/5 transition p-4"
                >
                  <span className="text-sm font-medium">+ Добавить страницу</span>
                </button>
              ) : (
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <textarea
                    value={newPageText}
                    onChange={(e) => setNewPageText(e.target.value)}
                    placeholder="Опишите страницу…"
                    rows={2}
                    className="w-full resize-none rounded-lg border-0 bg-transparent px-0 py-2 text-white placeholder:text-white/40 outline-none text-sm"
                    disabled={addPageLoading}
                  />
                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    {newPageText.trim().length >= 5 && (
                      <button
                        type="button"
                        onClick={handleAddPage}
                        disabled={addPageLoading}
                        className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0F0F0F] hover:bg-white/90 disabled:opacity-50"
                      >
                        {addPageLoading ? "Генерация…" : "Сгенерировать"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsAddingPage(false); setNewPageText(""); setAddPageError(null); }}
                      className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10"
                    >
                      Отмена
                    </button>
                  </div>
                  {addPageError && (
                    <div className="flex flex-wrap gap-2">
                      <p className="text-xs text-red-400">{addPageError}</p>
                      <button type="button" onClick={() => { setAddPageError(null); handleAddPage(); }} className="rounded-full border border-red-400/50 px-2 py-1 text-xs text-red-300 hover:bg-red-400/10">
                        Повторить
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-10 flex gap-4 items-center flex-wrap">
            {step >= 3 && step <= 7 && (
              <button type="button" onClick={handleStepClarifyClick} disabled={stepClarifyLoading} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
                {stepClarifyLoading ? "Загрузка…" : "Уточнить детали"}
              </button>
            )}
            {canPrev && (
              <button type="button" onClick={() => setStep(3)} className={`cursor-pointer ${btnSecondary}`}>
                Назад
              </button>
            )}
            {canNext && (
              <button type="button" onClick={() => setStep(5)} className={`cursor-pointer ${btnPrimary}`}>
                Далее
              </button>
            )}
          </div>
        </div>
      )}

      {/* Экран 5: Функционал (модули) — сетка карточек с акцентной полосой слева */}
      {step === 5 && aiStructure && (
        <div key="step5" className="animate-fade animate-step">
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            {[
              ...aiStructure.modules.map((moduleId) => ({
                id: moduleId,
                label: aiStructure.moduleLabels?.[moduleId] ?? MODULE_LABELS_RU[moduleId] ?? (moduleId.charAt(0).toUpperCase() + moduleId.slice(1).replace(/_/g, " ")),
                explanation: aiStructure.explanation[moduleId] ?? MODULE_FALLBACK_EXPLANATIONS[moduleId] ?? "",
                isExtra: false,
              })),
              ...extraModules.filter((em) => !aiStructure.modules.includes(em.id)).map((em) => ({ id: em.id, label: em.label, explanation: em.explanation, isExtra: true })),
            ].map(({ id: moduleId, label: labelCapitalized, explanation: expl, isExtra }) => {
              const isChecked = config.modules.includes(moduleId);
              return (
                <div
                  key={moduleId}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleModule(moduleId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleModule(moduleId);
                    }
                  }}
                  className="cursor-pointer rounded-2xl border border-white/15 transition text-left overflow-hidden relative"
                  style={{
                    borderLeftWidth: "4px",
                    borderLeftColor: isChecked ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
                    background: isChecked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                  }}
                  aria-pressed={isChecked}
                  aria-label={`${labelCapitalized}, ${isChecked ? "включено" : "выключено"}`}
                >
                  <div className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{labelCapitalized}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isExtra && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeExtraModule(moduleId); }}
                            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/15 transition"
                            aria-label={`Удалить ${labelCapitalized}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M12 4L4 12M4 4l8 8" />
                            </svg>
                          </button>
                        )}
                        <span
                          className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition"
                          style={{
                            borderColor: isChecked ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
                            background: isChecked ? "rgba(255,255,255,0.95)" : "transparent",
                          }}
                          aria-hidden
                        >
                          {isChecked && (
                            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                              <path d="M2 5l3 3 5-6" stroke="#0f0f0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm leading-snug text-white/55">{expl ?? "—"}</p>
                  </div>
                </div>
              );
            })}
            {/* Карточка «добавить модуль» */}
            <div
              className="rounded-2xl border-2 border-dashed border-white/25 overflow-hidden min-h-[100px] flex flex-col"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              {!isAddingModule ? (
                <button
                  type="button"
                  onClick={() => setIsAddingModule(true)}
                  className="flex-1 flex items-center justify-center min-h-[100px] w-full cursor-pointer text-white/60 hover:text-white/90 hover:bg-white/5 transition px-4 py-4"
                >
                  <span className="font-medium">+ Добавить модуль</span>
                </button>
              ) : (
                <div className="p-4 flex flex-col gap-3">
                  <textarea
                    value={newModuleText}
                    onChange={(e) => setNewModuleText(e.target.value)}
                    placeholder="Например: онлайн-оплата, калькулятор…"
                    rows={2}
                    className="w-full resize-none rounded-lg border-0 bg-transparent px-0 py-1 text-white placeholder:text-white/40 outline-none focus:ring-0 text-sm"
                    disabled={addModuleLoading}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {newModuleText.trim().length >= 2 && (
                      <button
                        type="button"
                        onClick={handleAddModule}
                        disabled={addModuleLoading}
                        className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0F0F0F] hover:bg-white/90 disabled:opacity-50"
                      >
                        {addModuleLoading ? "Генерация…" : "Сгенерировать"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsAddingModule(false); setNewModuleText(""); setAddModuleError(null); }}
                      className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10"
                    >
                      Отмена
                    </button>
                  </div>
                  {addModuleError && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-red-400">{addModuleError}</p>
                      <button
                        type="button"
                        onClick={() => { setAddModuleError(null); handleAddModule(); }}
                        className="rounded-full border border-red-400/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-400/10"
                      >
                        Попробовать снова
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {config.modules.includes("payments") && (
            <div className="mt-6 max-w-3xl">
              <h4 className="text-sm font-medium text-white/70 mb-2">Способы оплаты</h4>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(({ id, label }) => {
                  const on = brief.paymentMethods.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, paymentMethods: on ? b.paymentMethods.filter((x) => x !== id) : [...b.paymentMethods, id] }))} className={`rounded-full px-4 py-2 text-sm ${on ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {(config.projectType === "booking" || config.modules.includes("booking_calendar")) && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/70 mb-2">Тип бронирования</h4>
              <div className="flex flex-wrap gap-2">
                {BOOKING_TYPES.map(({ id, label }) => (
                  <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, bookingType: id }))} className={`rounded-full px-4 py-2 text-sm ${brief.bookingType === id ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {config.modules.includes("integrations") && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/70 mb-2">Интеграции</h4>
              <div className="flex flex-wrap gap-2">
                {INTEGRATIONS_LIST.map(({ id, label }) => {
                  const on = brief.integrations.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, integrations: on ? b.integrations.filter((x) => x !== id) : [...b.integrations, id] }))} className={`rounded-full px-4 py-2 text-sm ${on ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {(config.modules.includes("forms") || config.modules.includes("notifications")) && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/70 mb-2">Куда слать заявки</h4>
              <div className="flex flex-wrap gap-2">
                {NOTIFICATION_CHANNELS_LIST.map(({ id, label }) => {
                  const on = brief.notificationChannels.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, notificationChannels: on ? b.notificationChannels.filter((x) => x !== id) : [...b.notificationChannels, id] }))} className={`rounded-full px-4 py-2 text-sm ${on ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3 items-center">
            {step >= 3 && step <= 7 && (
              <button type="button" onClick={handleStepClarifyClick} disabled={stepClarifyLoading} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
                {stepClarifyLoading ? "Загрузка…" : "Уточнить детали"}
              </button>
            )}
            {canPrev && (
              <button type="button" onClick={() => setStep(4)} className={`cursor-pointer ${btnSecondary}`}>
                Назад
              </button>
            )}
            {canNext && (
              <button type="button" onClick={() => setStep(6)} className={`cursor-pointer ${btnPrimary}`}>
                Далее
              </button>
            )}
          </div>
        </div>
      )}

      {/* Экран 6: Дизайн и UX */}
      {step === 6 && (
        <div key="step6" className="animate-fade animate-step">
          

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <section>
              <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-4">Стиль дизайна</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(Object.keys(DESIGN_STYLE_LABELS) as string[]).map((styleId) => {
                  const isSelected = brief.designStyle === styleId;
                  const label = DESIGN_STYLE_LABELS[styleId];
                  const preview = DESIGN_STYLE_PREVIEW[styleId];
                  return (
                    <button
                      key={styleId}
                      type="button"
                      onClick={() => setBrief((b) => ({ ...b, designStyle: styleId as BriefState["designStyle"] }))}
                      className={`rounded-xl border-2 p-4 text-left transition ${
                        isSelected ? "border-white bg-white/15" : "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10"
                      }`}
                    >
                      <div className="w-full h-16 rounded-lg mb-3 overflow-hidden flex items-center justify-center" aria-hidden>
                        {styleId === "minimalism" && <div className="w-full h-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center"><div className="w-3/4 h-2 bg-white/40 rounded" /></div>}
                        {styleId === "corporate" && <div className="w-full h-full bg-gradient-to-br from-white/25 to-white/10 flex flex-col gap-1 p-2"><div className="h-2 bg-white/50 rounded w-full" /><div className="h-2 bg-white/30 rounded w-2/3" /><div className="h-2 bg-white/20 rounded w-1/2" /></div>}
                        {styleId === "bright" && <div className="w-full h-full bg-gradient-to-br from-amber-500/40 via-orange-400/30 to-rose-500/30" />}
                        {styleId === "creative" && <div className="w-full h-full bg-gradient-to-br from-violet-500/40 via-fuchsia-500/30 to-pink-500/30 rounded-lg" />}
                        {styleId === "shop" && <div className="w-full h-full bg-white/10 grid grid-cols-3 gap-0.5 p-1"><div className="bg-white/30 rounded" /><div className="bg-white/20 rounded" /><div className="bg-white/30 rounded" /><div className="bg-white/20 rounded" /><div className="bg-white/30 rounded" /><div className="bg-white/20 rounded" /></div>}
                        {styleId === "premium" && <div className="w-full h-full bg-gradient-to-br from-white/30 via-white/15 to-white/5" />}
                      </div>
                      <span className={`block font-semibold text-sm ${isSelected ? "text-white" : "text-white/90"}`}>{label}</span>
                      {preview && <span className="block text-xs text-white/50 mt-0.5">{preview}</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-4">UX и интерактивность</h3>
              <p className="text-sm text-white/55 mb-3">Отметьте, что для вас важно.</p>
              <div className="flex flex-wrap gap-2">
                {UX_OPTIONS.map(({ id, label }) => {
                  const on = (brief.uxOptions ?? []).includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBrief((b) => ({
                        ...b,
                        uxOptions: on ? (b.uxOptions ?? []).filter((x) => x !== id) : [...(b.uxOptions ?? []), id],
                      }))}
                      className={`rounded-full px-4 py-2.5 text-sm font-medium transition border ${
                        on ? "bg-white text-[#0F0F0F] border-white" : "bg-white/5 text-white border-white/15 hover:bg-white/10 hover:border-white/25"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 items-center">
            {step >= 3 && step <= 7 && step !== 6 && (
              <button type="button" onClick={handleStepClarifyClick} disabled={stepClarifyLoading} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
                {stepClarifyLoading ? "Загрузка…" : "Уточнить детали"}
              </button>
            )}
            {canPrev && (
              <button type="button" onClick={() => setStep(5)} className={`cursor-pointer ${btnSecondary}`}>
                Назад
              </button>
            )}
            {canNext && (
              <button type="button" onClick={() => setStep(7)} className={`cursor-pointer ${btnPrimary}`}>
                Далее
              </button>
            )}
          </div>
        </div>
      )}

      {/* Экран 7: Сроки */}
      {step === 7 && (
        <div key="step7" className="animate-fade animate-step">
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col gap-4">
              {(["standard", "urgent", "express"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateConfig({ timeline: t })}
                  className={`cursor-pointer rounded-xl px-6 py-4 text-left transition ${
                    config.timeline === t
                      ? "bg-white text-[#0F0F0F]"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  style={{
                    border: config.timeline === t ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <span className="block font-semibold">{TIMELINE_LABELS[t]}</span>
                  <span className={`mt-1 block text-sm ${config.timeline === t ? "text-[#0F0F0F]/70" : "text-white/55"}`}>
                    {TIMELINE_DESCRIPTIONS[t]}
                  </span>
                </button>
              ))}
            </div>
            <div className="border border-white/15 rounded-xl overflow-hidden bg-white/5">
              {(["standard", "urgent", "express"] as const).map((t) => (
                <div key={t} className="border-b border-white/10 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenTimelineAccordion((prev) => (prev === t ? null : t))}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-white/90 hover:bg-white/5 transition flex items-center justify-between gap-2"
                  >
                    Что значит {TIMELINE_LABELS[t]}
                    <span className="shrink-0 text-white/60 transition-transform" style={{ transform: openTimelineAccordion === t ? "rotate(180deg)" : "none" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                    </span>
                  </button>
                  {openTimelineAccordion === t && (
                    <div className="px-4 pb-3 pt-0">
                      <ul className="text-sm text-white/70 space-y-1.5 list-disc list-inside">
                        {TIMELINE_WHAT_MEANS[t].map((item: string, i: number) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3 items-center">
            {step >= 3 && step <= 7 && (
              <button type="button" onClick={handleStepClarifyClick} disabled={stepClarifyLoading} className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50">
                {stepClarifyLoading ? "Загрузка…" : "Уточнить детали"}
              </button>
            )}
            {canPrev && (
              <button type="button" onClick={() => setStep(6)} className={`cursor-pointer ${btnSecondary}`}>
                Назад
              </button>
            )}
            {canNext && (
              <button
                type="button"
                onClick={() => {
                  if (config.pages.length === 0) { setNoPagesWarning(true); return; }
                  setStep(8);
                }}
                className={`cursor-pointer ${btnPrimary}`}
              >
                Далее
              </button>
            )}
          </div>
          {noPagesWarning && (
            <div className="mt-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3">
              <p className="text-white/80 text-sm">Страницы не выбраны. Перейти к проверке?</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setNoPagesWarning(false); setStep(4); }} className={`cursor-pointer ${btnSecondary} py-2 px-4`}>
                  К структуре
                </button>
                <button type="button" onClick={() => { setNoPagesWarning(false); setStep(8); }} className="cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25">
                  Да, к проверке
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Экран 8: Проверьте перед отправкой */}
      {step === 8 && (
        <div key="step8" className="animate-fade animate-step">
          <div className="mt-6 space-y-4 max-w-2xl">
            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <span className="text-white/90">Тип проекта</span>
              <span className="font-medium text-white">{PROJECT_TYPE_LABELS[config.projectType]}</span>
              <button type="button" onClick={() => setStep(3)} className={`cursor-pointer ${btnSecondary} py-2 px-4 text-sm`}>Изменить</button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <span className="text-white/90">Страницы</span>
              <span className="font-medium text-white text-sm">
                {config.pages.length
                  ? config.pages.slice(0, 3).map((id) => aiStructure?.pageLabels?.[id] ?? extraPages?.find((e) => e.id === id)?.label ?? PAGE_LABELS_RU[id] ?? id).join(", ") + (config.pages.length > 3 ? "…" : "")
                  : "—"}
              </span>
              <button type="button" onClick={() => setStep(4)} className={`cursor-pointer ${btnSecondary} py-2 px-4 text-sm`}>Изменить</button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <span className="text-white/90">Модули</span>
              <span className="font-medium text-white text-sm">
                {config.modules.length
                  ? config.modules.slice(0, 3).map((id) => aiStructure?.moduleLabels?.[id] ?? extraModules?.find((e) => e.id === id)?.label ?? MODULE_LABELS_RU[id] ?? id).join(", ") + (config.modules.length > 3 ? "…" : "")
                  : "—"}
              </span>
              <button type="button" onClick={() => setStep(5)} className={`cursor-pointer ${btnSecondary} py-2 px-4 text-sm`}>Изменить</button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <span className="text-white/90">Стиль дизайна</span>
              <span className="font-medium text-white">{DESIGN_STYLE_LABELS[brief.designStyle] ?? brief.designStyle}</span>
              <button type="button" onClick={() => setStep(6)} className={`cursor-pointer ${btnSecondary} py-2 px-4 text-sm`}>Изменить</button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <span className="text-white/90">Сроки</span>
              <span className="font-medium text-white">{TIMELINE_LABELS[config.timeline]}</span>
              <button type="button" onClick={() => setStep(7)} className={`cursor-pointer ${btnSecondary} py-2 px-4 text-sm`}>Изменить</button>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep(7)} className={`cursor-pointer ${btnSecondary}`}>Назад</button>
            <button type="button" onClick={() => setStep(9)} className={`cursor-pointer ${btnPrimary}`}>Всё верно, к итогу</button>
          </div>
        </div>
      )}

      {/* Экран 9: Итог */}
      {step === 9 && (
        <div key="step9" className="animate-fade animate-step">
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            {/* Левая часть: цена и действия */}
            <div className="flex-1 min-w-0 lg:min-w-0 flex flex-col gap-4">
              <p className="text-3xl font-semibold text-white">
                Ориентировочная стоимость:{" "}
                {priceRange.min.toLocaleString("ru")} – {priceRange.max.toLocaleString("ru")} ₽
              </p>
              <button
                type="button"
                onClick={() => { setShowPriceModal(true); if (!explainText && !explainLoading) handleExplainPrice(); }}
                disabled={explainLoading}
                className="cursor-pointer rounded-full border border-white/30 px-5 py-2.5 text-white hover:bg-white/10 disabled:opacity-50 text-sm font-medium w-fit"
              >
                {explainLoading ? "AI объясняет…" : "Из чего складывается сумма"}
              </button>
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={() => setShowLeadFormModal(true)} className="cursor-pointer rounded-full bg-white px-6 py-3 text-[#0F0F0F] font-semibold hover:bg-white/90 text-sm">
                  Получить подробный расчёт и ТЗ
                </button>
                <button type="button" onClick={() => setStep(8)} className="cursor-pointer rounded-full border border-white/30 px-6 py-3 text-white hover:bg-white/10 text-sm">
                  Назад
                </button>
              </div>
              {briefError && <p className="text-sm text-red-400 mt-2">{briefError}</p>}
              {/* Кнопки внизу левой части (на уровне конца правой части), без бордера */}
              <div className="flex flex-wrap gap-2 mt-auto pt-6">
                <button
                  type="button"
                  disabled={briefLoading}
                  onClick={async () => {
                    if (briefText) {
                      setShowBriefModal(true);
                      return;
                    }
                    setBriefError(null);
                    setBriefLoading(true);
                    const { text, error: err } = await generateBrief(description, config);
                    setBriefLoading(false);
                    if (err) setBriefError(err);
                    else if (text) { setBriefText(text); setShowBriefModal(true); }
                  }}
                  className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {briefLoading ? "Формирую…" : "Сформировать описание проекта"}
                </button>
                <button
                  type="button"
                  disabled={checklistLoading}
                  onClick={async () => {
                    if (launchChecklist.length > 0) {
                      setShowChecklistModal(true);
                      return;
                    }
                    setChecklistLoading(true);
                    const list = await getLaunchChecklist(config);
                    setLaunchChecklist(list);
                    setChecklistLoading(false);
                    setShowChecklistModal(true);
                  }}
                  className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {checklistLoading ? "Загрузка…" : "Чек-лист перед запуском"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (recommendations !== null) {
                      setShowRecommendationsModal(true);
                      return;
                    }
                    const r = await suggestRecommendations({ config, description, brief });
                    setRecommendations(r);
                    setShowRecommendationsModal(true);
                  }}
                  className="cursor-pointer rounded-full border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  Рекомендации: что ещё добавить
                </button>
              </div>
            </div>
            {/* Правая часть: резюме */}
            <div className="flex-1 min-w-0 lg:min-w-0">
              <div className=" text-3xl text-white/80 space-y-1 mb-5">
                <p className="font-semibold text-white/90 mb-2">Этапы:</p>
                {getTimelineStages(config).map((s, i) => (
                  <div key={i} className="flex justify-between text-2xl"><span>{s.name}</span><span>{s.minWeeks}–{s.maxWeeks} нед.</span></div>
                ))}
                <p className="text-white/70 text-xl text-right">
                  Примерно {timelineWeeks.minWeeks}–{timelineWeeks.maxWeeks} недель
                </p>
              </div>
              <dl className=" text-white/80 space-y-2">
                <div>
                  <dt className="text-white/50 text-2xl">Тип проекта</dt>
                  <dd className="mt-0.5 font-medium text-xl">{PROJECT_TYPE_LABELS[config.projectType]}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-2xl">Страницы</dt>
                  <dd className="mt-0.5 font-medium text-xl">
                    {config.pages.length
                      ? config.pages
                          .map(
                            (id) =>
                              aiStructure?.pageLabels?.[id] ?? extraPages?.find((e) => e.id === id)?.label ?? PAGE_LABELS_RU[id] ?? id
                          )
                          .join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50 text-2xl">Модули</dt>
                  <dd className="mt-0.5 font-medium text-xl">
                    {config.modules.length
                      ? config.modules
                          .map(
                            (id) =>
                              aiStructure?.moduleLabels?.[id] ?? extraModules?.find((e) => e.id === id)?.label ?? MODULE_LABELS_RU[id] ?? id
                          )
                          .join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50 text-2xl">Стиль дизайна</dt>
                  <dd className="mt-0.5 font-medium text-xl">{DESIGN_STYLE_LABELS[brief.designStyle] ?? brief.designStyle}</dd>
                </div>
                <div>
                  <dt className="text-white/50 text-2xl">Сроки</dt>
                  <dd className="mt-0.5 font-medium text-xl">{TIMELINE_LABELS[config.timeline]}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: уточнить детали по текущему шагу */}
      {showStepClarifyModal && stepClarifyQuestions.length > 0 && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60"
            onClick={handleStepClarifyClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="step-clarify-title"
          >
            <div
              className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="step-clarify-title" className="text-xl font-semibold text-white mb-4">
                Уточнить детали
              </h3>
              <p className="text-sm text-white/60 mb-4">Ответьте на вопросы по текущему шагу (по желанию). Выбор сохранится при закрытии.</p>
              <ul className="space-y-3 mb-4">
                {stepClarifyQuestions.map((q, i) => {
                  const isSelected = !!stepClarifyAnswers[i];
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setStepClarifyAnswers((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className="w-full cursor-pointer rounded-xl px-4 py-3 text-left text-sm transition hover:bg-white/10"
                        style={{
                          background: isSelected ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                          border: isSelected ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <span className={isSelected ? "text-white" : "text-white/70"}>{q}</span>
                        <span className="ml-2 text-white/50 text-xs">{isSelected ? "Да" : "Нет"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleStepClarifyClose}
                  className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Комментарий */}
      {showCommentModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowCommentModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="comment-modal-title"
          >
            <div
              className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="comment-modal-title" className="text-xl font-semibold text-white mb-4">
                Комментарий
              </h3>
              <textarea
                value={brief.comment ?? ""}
                onChange={(e) => setBrief((b) => ({ ...b, comment: e.target.value }))}
                placeholder="Добавьте комментарий к референсам..."
                rows={4}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40 resize-none"
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCommentModal(false)}
                  className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90"
                >
                  Сохранить и закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Блоки на главной */}
      {showMainBlocksModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowMainBlocksModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="main-blocks-modal-title"
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="main-blocks-modal-title" className="text-xl font-semibold text-white mb-4">
                Блоки на главной
              </h3>
              <button
                type="button"
                onClick={() => setShowMainBlocksModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              <div className="flex flex-wrap gap-2 items-center mt-6">
                {MAIN_PAGE_BLOCKS.map(({ id, label }) => {
                  const on = brief.mainPageBlocks.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, mainPageBlocks: on ? b.mainPageBlocks.filter((x) => x !== id) : [...b.mainPageBlocks, id] }))} className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${on ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white hover:bg-white/20 border border-white/10"}`}>
                      {label}
                    </button>
                  );
                })}
                {(brief.customMainBlocks ?? []).map(({ id, label }) => {
                  const on = brief.mainPageBlocks.includes(id);
                  return (
                    <span key={id} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition shrink-0 ${on ? "bg-white text-[#0F0F0F]" : "bg-white/10 text-white hover:bg-white/20"}`}>
                      <button type="button" onClick={() => setBrief((b) => ({ ...b, mainPageBlocks: on ? b.mainPageBlocks.filter((x) => x !== id) : [...b.mainPageBlocks, id] }))} className="text-left">
                        {label}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeMainBlock(id); }} className={`p-0.5 rounded-full shrink-0 ${on ? "text-[#0F0F0F]/60 hover:bg-[#0F0F0F]/15 hover:text-[#0F0F0F]" : "text-white/50 hover:text-white hover:bg-white/15"}`} aria-label="Удалить блок">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L4 12M4 4l8 8" /></svg>
                      </button>
                    </span>
                  );
                })}
                {!isAddingMainBlock ? (
                  <button type="button" onClick={() => setIsAddingMainBlock(true)} className="rounded-full px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white border-2 border-dashed border-white/30 bg-transparent hover:bg-white/5 transition min-w-[7rem]">
                    Новый блок
                  </button>
                ) : (
                  <span className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-medium border-2 border-dashed border-white/30 bg-transparent min-w-[10rem]">
                    <input
                      type="text"
                      value={newMainBlockText}
                      onChange={(e) => setNewMainBlockText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddMainBlock(); if (e.key === "Escape") { setIsAddingMainBlock(false); setNewMainBlockText(""); setAddMainBlockError(null); } }}
                      placeholder="Опишите блок…"
                      className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white placeholder:text-white/40"
                      autoFocus
                      disabled={addMainBlockLoading}
                    />
                    {newMainBlockText.trim().length >= 2 && (
                      <button type="button" onClick={handleAddMainBlock} disabled={addMainBlockLoading} className="shrink-0 ml-1 text-white/70 hover:text-white">
                        {addMainBlockLoading ? "…" : "✓"}
                      </button>
                    )}
                    <button type="button" onClick={() => { setIsAddingMainBlock(false); setNewMainBlockText(""); setAddMainBlockError(null); }} className="shrink-0 ml-1 text-white/50 hover:text-white">×</button>
                  </span>
                )}
              </div>
              {addMainBlockError && <p className="mt-2 text-xs text-red-400">{addMainBlockError}</p>}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMainBlocksModal(false)}
                  className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Из чего складывается сумма (текст ИИ + таблица детальных цен) */}
      {showPriceModal && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowPriceModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-modal-title"
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="price-modal-title" className="text-xl font-semibold text-white mb-4">
                Из чего складывается сумма
              </h3>
              <button
                type="button"
                onClick={() => setShowPriceModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              {explainLoading ? (
                <p className="text-white/60 text-sm">Генерация объяснения…</p>
              ) : (
                <>
                  {explainText && <p className="text-white/80 text-sm leading-relaxed mb-4">{explainText}</p>}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm space-y-2">
                    {getPriceBreakdown(config).map((item, i) => (
                      <div key={i} className="flex justify-between text-white/90">
                        <span>{item.label}</span>
                        <span>{item.min.toLocaleString("ru")} – {item.max.toLocaleString("ru")} ₽</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium text-white pt-2 border-t border-white/10">
                      <span>Итого</span>
                      <span>{priceRange.min.toLocaleString("ru")} – {priceRange.max.toLocaleString("ru")} ₽</span>
                    </div>
                  </div>
                </>
              )}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setShowPriceModal(false)} className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90">
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Описание проекта */}
      {showBriefModal && briefText && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowBriefModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="brief-modal-title"
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="brief-modal-title" className="text-xl font-semibold text-white mb-4">
                Описание проекта
              </h3>
              <button
                type="button"
                onClick={() => setShowBriefModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/80 whitespace-pre-wrap">{briefText}</div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setShowBriefModal(false)} className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90">
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Чек-лист перед запуском */}
      {showChecklistModal && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowChecklistModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-modal-title"
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="checklist-modal-title" className="text-xl font-semibold text-white mb-4">
                Чек-лист перед запуском
              </h3>
              <button
                type="button"
                onClick={() => setShowChecklistModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              {launchChecklist.length > 0 ? (
                <ul className="list-disc list-inside text-sm text-white/80 space-y-1">{launchChecklist.map((item, i) => <li key={i}>{item}</li>)}</ul>
              ) : (
                <p className="text-white/60 text-sm">Загрузите чек-лист, нажав кнопку на экране Итог.</p>
              )}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setShowChecklistModal(false)} className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90">
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: Рекомендации */}
      {showRecommendationsModal && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowRecommendationsModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="recommendations-modal-title"
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="recommendations-modal-title" className="text-xl font-semibold text-white mb-4">
                Рекомендации: что ещё добавить
              </h3>
              <button
                type="button"
                onClick={() => setShowRecommendationsModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              {recommendations && (recommendations.pages.length > 0 || recommendations.modules.length > 0) ? (
                <div className="space-y-2 text-sm">
                  <p className="text-white/80">{recommendations.reason}</p>
                  <p className="text-white/70">
                    {recommendations.pages.length ? "Страницы: " + recommendations.pages.map((id) => PAGE_LABELS_RU[id] ?? id).join(", ") + ". " : ""}
                    {recommendations.modules.length ? "Модули: " + recommendations.modules.map((id) => MODULE_LABELS_RU[id] ?? id).join(", ") : ""}
                  </p>
                </div>
              ) : (
                <p className="text-white/60 text-sm">Дополнительных рекомендаций нет — структура полная.</p>
              )}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setShowRecommendationsModal(false)} className="cursor-pointer rounded-full bg-white px-6 py-2.5 text-[#0F0F0F] font-semibold text-sm hover:bg-white/90">
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Модальное окно: форма заявки — рендер в body, чтобы было по центру экрана */}
      {showLeadFormModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={() => setShowLeadFormModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div
              className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0F0F0F] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="modal-title" className="text-xl font-semibold text-white">
                Получить подробный расчёт и ТЗ
              </h3>
              <button
                type="button"
                onClick={() => setShowLeadFormModal(false)}
                className="absolute top-4 right-4 rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10 transition"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
              <form
                className="mt-6 flex flex-col gap-3"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="text"
                  placeholder="Имя"
                  value={leadForm.name}
                  onChange={(e) => setLeadForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40"
                />
                <input
                  type="tel"
                  placeholder="Телефон"
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-full bg-white px-8 py-4 text-[#0F0F0F] font-semibold hover:bg-white/90"
                >
                  Отправить заявку
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
