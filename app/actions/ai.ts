"use server";

import type { AIProjectStructure, ProjectConfig, PriceRange, ProjectType, BriefState } from "@/app/types/project";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MAX_TOKENS = 1500;
const MISTRAL_MODEL = "mistral-small-latest";

const systemPrompt = `Ты AI-архитектор веб-проектов. По тексту пользователя определи тип проекта и предложи полную структуру: страницы и модули, которые реально нужны для такого проекта.

КРИТИЧЕСКИ ВАЖНО — по типу проекта ВСЕГДА включай логичный минимум:

• ecommerce (интернет-магазин): ОБЯЗАТЕЛЬНО recommendedPages: home, catalog, product, cart, checkout, account, contacts (или faq). ОБЯЗАТЕЛЬНО modules: auth, user_dashboard, payments, search, forms. По смыслу добавь: reviews, admin_panel, integrations.
• catalog (каталог товаров/услуг без корзины): home, catalog, product, contacts; modules: search, forms. Если упомянут личный кабинет — auth, user_dashboard.
• saas / web_app (сервис с подпиской или веб-приложение): ОБЯЗАТЕЛЬНО home, pricing (или services), account; ОБЯЗАТЕЛЬНО modules: auth, user_dashboard, payments или subscriptions. По смыслу: admin_panel, analytics, notifications, integrations.
• booking (бронирование): ОБЯЗАТЕЛЬНО home, booking_form, account, contacts; ОБЯЗАТЕЛЬНО modules: auth, booking_calendar, forms. По смыслу: payments, user_dashboard, notifications.
• corporate (корпоративный сайт): home, about, services, contacts; по смыслу: team, portfolio, cases, faq; modules: forms, multilang при необходимости.
• landing (лендинг на одну цель): home, contacts; modules: forms. Минимум страниц.
• blog / медиа: home, blog, contacts; по смыслу: multilang; modules: search, forms.
• crm (внутренняя система): home, account; modules: auth, user_dashboard, admin_panel, analytics, export; по смыслу: integrations, notifications.

Дополнительно: если в тексте упомянуты оплата онлайн — включи payments; калькулятор — calculator; несколько языков — multilang; чат с поддержкой — chat; рассылки/уведомления — notifications; выгрузка данных — export.

ID страниц (только из этого списка): home, services, cases, contacts, about, catalog, cart, faq, pricing, team, portfolio, blog, product, checkout, account, booking_form, reviews, contacts_map.
ID модулей (только из этого списка): auth, user_dashboard, admin_panel, payments, forms, integrations, calculator, multilang, reviews, search, notifications, chat, booking_calendar, subscriptions, analytics, export.

ОБЯЗАТЕЛЬНО для КАЖДОЙ страницы из recommendedPages и КАЖДОГО модуля из modules заполни в explanation:
- explanation[id] — ровно одно короткое предложение на русском, зачем это в этом проекте (под контекст пользователя). Не пропускай ни одного id.
- pageLabels[id] / moduleLabels[id] — короткое название на русском (2–3 слова).

В объекте explanation должны быть ВСЕ id из modules и ВСЕ id из recommendedPages. Без исключений.

projectType — строго один из: landing, corporate, web_app, crm, ecommerce, blog, catalog, saas, booking.

Верни СТРОГО валидный JSON, без markdown и лишнего текста:
{
  "projectType": "тип из списка выше",
  "modules": ["массив id модулей"],
  "recommendedPages": ["массив id страниц"],
  "pageLabels": { "id": "Название на русском" },
  "moduleLabels": { "id": "Название на русском" },
  "complexity": "low" | "medium" | "high",
  "explanation": { "каждый id из modules и recommendedPages": "короткое объяснение на русском" }
}`;

/** Генерация 3 примеров описаний проектов для подсказок на шаге 1. */
export async function getExamplePrompts(): Promise<{ data: string[] | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { data: null, error: null };
  }
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Придумай 3 разных коротких примера описания сайта/сервиса для конструктора (как бы написал заказчик в одну строку). Типы: например интернет-магазин, сайт бронирования, лендинг для услуги, корпоративный сайт, SaaS. Каждый пример — одно предложение на русском, до 80 символов. Верни СТРОГО JSON: { "examples": ["пример 1", "пример 2", "пример 3"] }. Без markdown.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 250,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return { data: null, error: null };
    const cleaned = content.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();
    const raw = JSON.parse(cleaned) as { examples?: unknown };
    const examples = Array.isArray(raw.examples)
      ? raw.examples.slice(0, 3).filter((e): e is string => typeof e === "string" && e.length > 0)
      : [];
    return { data: examples.length ? examples : null, error: null };
  } catch {
    return { data: null, error: null };
  }
}

const explainPricePrompt = (config: ProjectConfig, price: PriceRange) =>
  `Конфигурация проекта: тип ${config.projectType}, страницы: ${config.pages.join(", ")}, модули: ${config.modules.join(", ")}, дизайн: ${config.designLevel}, сроки: ${config.timeline}.
Диапазон цены: ${price.min.toLocaleString("ru")} – ${price.max.toLocaleString("ru")} ₽.
Объясни пользователю человеческим языком, из чего складывается цена (2–3 предложения). Без списков, только текст.`;

const VALID_PROJECT_TYPES = ["landing", "corporate", "web_app", "crm", "ecommerce", "blog", "catalog", "saas", "booking"] as const;

const VALID_MODULE_IDS = ["auth", "user_dashboard", "admin_panel", "payments", "forms", "integrations", "calculator", "multilang", "reviews", "search", "notifications", "chat", "booking_calendar", "subscriptions", "analytics", "export"] as const;

const VALID_PAGE_IDS = ["home", "services", "cases", "contacts", "about", "catalog", "cart", "faq", "pricing", "team", "portfolio", "blog", "product", "checkout", "account", "booking_form", "reviews", "contacts_map"] as const;

function parseAIResponse(text: string): AIProjectStructure {
  const cleaned = text.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();
  const raw = JSON.parse(cleaned) as Record<string, unknown>;
  const projectType: ProjectType = VALID_PROJECT_TYPES.includes(raw.projectType as ProjectType)
    ? (raw.projectType as ProjectType)
    : "landing";

  const rawModules = Array.isArray(raw.modules) ? raw.modules.map((m) => String(m).replace(/\s+/g, "_").toLowerCase()) : [];
  let modules = [...new Set(rawModules.filter((m) => VALID_MODULE_IDS.includes(m as (typeof VALID_MODULE_IDS)[number])))];
  if (modules.length === 0 && projectType === "landing") modules = ["forms"];

  const rawPages = Array.isArray(raw.recommendedPages) ? raw.recommendedPages.map((p) => String(p).replace(/\s+/g, "_").toLowerCase()) : [];
  let recommendedPages = [...new Set(rawPages.filter((p) => VALID_PAGE_IDS.includes(p as (typeof VALID_PAGE_IDS)[number])))];
  if (recommendedPages.length === 0) recommendedPages = ["home", "contacts"];

  const rawPageLabels = typeof raw.pageLabels === "object" && raw.pageLabels !== null ? (raw.pageLabels as Record<string, string>) : {};
  const pageLabels: Record<string, string> = {};
  recommendedPages.forEach((id) => {
    if (typeof rawPageLabels[id] === "string") pageLabels[id] = rawPageLabels[id];
  });

  const rawModuleLabels = typeof raw.moduleLabels === "object" && raw.moduleLabels !== null ? (raw.moduleLabels as Record<string, string>) : {};
  const moduleLabels: Record<string, string> = {};
  modules.forEach((id) => {
    if (typeof rawModuleLabels[id] === "string") moduleLabels[id] = rawModuleLabels[id];
  });

  const rawExplanation = typeof raw.explanation === "object" && raw.explanation !== null ? (raw.explanation as Record<string, string>) : {};
  const explanation: Record<string, string> = {};
  [...modules, ...recommendedPages].forEach((id) => {
    if (typeof rawExplanation[id] === "string") explanation[id] = rawExplanation[id];
  });

  return {
    projectType,
    modules,
    recommendedPages,
    pageLabels,
    moduleLabels,
    complexity: raw.complexity === "low" || raw.complexity === "medium" || raw.complexity === "high" ? raw.complexity : "medium",
    explanation,
  };
}

/** Генерация описаний для модулей/страниц, у которых нет explanation. Один запрос на все недостающие id. */
async function fillMissingExplanations(
  description: string,
  projectType: ProjectType,
  missingIds: string[],
  moduleLabels: Record<string, string>,
  pageLabels: Record<string, string>
): Promise<Record<string, string>> {
  if (!MISTRAL_API_KEY || missingIds.length === 0) return {};
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const idsList = missingIds.join(", ");
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Описание проекта: «${description.slice(0, 500)}». Тип проекта: ${projectType}.

Для КАЖДОГО из следующих id (модули или страницы) напиши одно короткое предложение на русском — зачем это нужно в этом проекте. Не пропускай ни одного.
ID: ${idsList}

Верни СТРОГО JSON без markdown: объект, где ключ — id из списка, значение — одно предложение на русском. Пример: { "auth": "Вход для личного кабинета и заказов.", "forms": "Формы заявок и обратной связи." }`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 800,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return {};
    const cleaned = content.replace(/```json\s?/g, "").replace(/```/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const id of missingIds) {
      const v = raw[id];
      if (typeof v === "string" && v.trim()) out[id] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Анализ описания проекта → структура в JSON. Вызывается только на сервере. */
export async function analyzeProject(
  description: string
): Promise<{ data: AIProjectStructure | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { data: null, error: "MISTRAL_API_KEY не настроен. Добавьте ключ в .env.local" };
  }
  const trimmed = description.trim();
  if (trimmed.length < 10) {
    return { data: null, error: "Опишите проект подробнее" };
  }

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmed },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: MAX_TOKENS,
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map((c: { type?: string; text?: string }) => (c && typeof c === "object" && "text" in c ? c.text : "")).join("")
        : "";
    if (!content.trim()) {
      return { data: null, error: "Пустой ответ AI" };
    }

    const data = parseAIResponse(content);
    const allIds = [...data.modules, ...data.recommendedPages];
    const missingIds = allIds.filter(
      (id) => !data.explanation[id] || !String(data.explanation[id]).trim()
    );
    if (missingIds.length > 0) {
      const filled = await fillMissingExplanations(
        trimmed,
        data.projectType,
        missingIds,
        data.moduleLabels ?? {},
        data.pageLabels ?? {}
      );
      data.explanation = { ...data.explanation, ...filled };
    }
    return { data, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { data: null, error: message };
  }
}

const suggestPagePrompt = (description: string) =>
  `Пользователь хочет добавить ещё одну страницу на сайт. Описание: «${description}».

Верни ОДНУ страницу в формате JSON:
- id — латиница в snake_case (если подходит существующий тип — используй из списка: home, services, cases, contacts, about, catalog, cart, faq, pricing, team, portfolio, blog, product, checkout, account, booking_form, reviews, contacts_map; иначе придумай id, например delivery, privacy_policy, guarantees).
- label — короткое название на русском (2–3 слова).
- explanation — одно предложение на русском, зачем эта страница.

Только JSON, без markdown: { "id": "...", "label": "...", "explanation": "..." }`;

const suggestModulePrompt = (description: string) =>
  `Пользователь хочет добавить ещё один модуль функционала на сайт. Описание: «${description}».

Верни ОДИН модуль в формате JSON:
- id — строго один из списка (snake_case): auth, user_dashboard, admin_panel, payments, forms, integrations, calculator, multilang, reviews, search, notifications, chat, booking_calendar, subscriptions, analytics, export. Выбери самый подходящий по смыслу; если описание не подходит ни под один — выбери наиболее близкий (например, «онлайн-оплата» → payments, «калькулятор» → calculator).
- label — короткое название на русском (2–3 слова).
- explanation — одно предложение на русском, зачем этот модуль в проекте.

Только JSON, без markdown: { "id": "...", "label": "...", "explanation": "..." }`;

/** Генерация одного модуля по описанию пользователя (для блока «добавить модуль»). */
export async function suggestModule(
  description: string
): Promise<{ data: { id: string; label: string; explanation: string } | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { data: null, error: "MISTRAL_API_KEY не настроен" };
  }
  const trimmed = description.trim();
  if (trimmed.length < 2) {
    return { data: null, error: "Опишите модуль хотя бы в двух символах" };
  }

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [{ role: "user", content: suggestModulePrompt(trimmed) }],
      responseFormat: { type: "json_object" },
      maxTokens: 300,
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text?: string }).text ?? "" : ""))
              .join("")
              .trim()
          : "";
    if (!content) {
      return { data: null, error: "Пустой ответ AI" };
    }

    const cleaned = content.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const rawId = typeof raw.id === "string" ? raw.id.replace(/\s+/g, "_").toLowerCase() : "forms";
    const id = VALID_MODULE_IDS.includes(rawId as (typeof VALID_MODULE_IDS)[number]) ? rawId : "forms";
    const label = typeof raw.label === "string" ? raw.label : "Новый модуль";
    const explanation = typeof raw.explanation === "string" ? raw.explanation : "";

    return { data: { id, label, explanation }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { data: null, error: message };
  }
}

/** Генерация одной страницы по описанию пользователя (для блока «добавить страницу»). */
export async function suggestPage(
  description: string
): Promise<{ data: { id: string; label: string; explanation: string } | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { data: null, error: "MISTRAL_API_KEY не настроен" };
  }
  const trimmed = description.trim();
  if (trimmed.length < 2) {
    return { data: null, error: "Опишите страницу хотя бы в двух символах" };
  }

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [{ role: "user", content: suggestPagePrompt(trimmed) }],
      responseFormat: { type: "json_object" },
      maxTokens: 300,
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text?: string }).text ?? "" : ""))
              .join("")
              .trim()
          : "";
    if (!content) {
      return { data: null, error: "Пустой ответ AI" };
    }

    const cleaned = content.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.replace(/\s+/g, "_").toLowerCase() : "custom_page";
    const label = typeof raw.label === "string" ? raw.label : "Новая страница";
    const explanation = typeof raw.explanation === "string" ? raw.explanation : "";

    return { data: { id, label, explanation }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { data: null, error: message };
  }
}

/** Генерация названия блока главной страницы по тексту пользователя. */
export async function suggestMainBlock(
  userText: string
): Promise<{ data: { id: string; label: string } | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { data: null, error: "MISTRAL_API_KEY не настроен" };
  }
  const trimmed = userText.trim();
  if (trimmed.length < 2) {
    return { data: null, error: "Опишите блок хотя бы в двух символах" };
  }

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Пользователь хочет добавить блок на главную страницу сайта. Его описание: «${trimmed}». Придумай короткое название блока на русском (2–4 слова), например: «Калькулятор», «Галерея работ», «Партнёры», «Видео о компании». Верни СТРОГО JSON: { "label": "Название блока" }. Без markdown.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 100,
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return { data: null, error: "Пустой ответ" };

    const cleaned = content.replace(/```json\s?/g, "").replace(/```/g, "").trim();
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label : trimmed;
    const id = "custom_" + Date.now();

    return { data: { id, label }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { data: null, error: message };
  }
}

/** AI объясняет цену (отдельный запрос). */
export async function explainPrice(
  config: ProjectConfig,
  price: PriceRange
): Promise<{ text: string | null; error: string | null }> {
  if (!MISTRAL_API_KEY) {
    return { text: null, error: "MISTRAL_API_KEY не настроен" };
  }

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: explainPricePrompt(config, price),
        },
      ],
      maxTokens: 300,
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text?: string }).text ?? "" : ""))
              .join("")
              .trim()
          : null;
    return { text: text || null, error: text ? null : "Пустой ответ" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { text: null, error: message };
  }
}

const CLARIFY_THRESHOLD = 80;

const STEP_NAMES: Record<number, string> = {
  2: "Дополнительно",
  3: "Тип проекта",
  4: "Структура страниц",
  5: "Функционал (модули)",
  6: "Дизайн и UX",
  7: "Сроки",
};

/** 2–3 уточняющих вопроса по текущему шагу конструктора. */
export async function getStepClarifyingQuestions(
  step: number,
  description: string,
  config: ProjectConfig
): Promise<{ data: string[] | null; error: string | null }> {
  if (!MISTRAL_API_KEY || step < 2 || step > 7) {
    return { data: null, error: null };
  }
  const stepName = STEP_NAMES[step] ?? "текущий шаг";
  const context = `Описание: «${description.trim() || "не указано"}». Тип: ${config.projectType}. Страницы: ${config.pages.join(", ") || "нет"}. Модули: ${config.modules.join(", ") || "нет"}. Дизайн: ${config.designLevel}. Сроки: ${config.timeline}.`;
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Пользователь на шаге «${stepName}» конструктора сайтов. Контекст: ${context}. Сгенерируй 2–3 коротких уточняющих вопроса (да/нет или выбор), которые помогут точнее определить выбор на ЭТОМ шаге. Верни СТРОГО JSON: { "questions": ["вопрос 1", "вопрос 2"] }. Только вопросы на русском.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 250,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return { data: null, error: null };
    const raw = JSON.parse(content.replace(/```json\s?/g, "").replace(/```/g, "").trim()) as { questions?: string[] };
    const questions = Array.isArray(raw.questions) ? raw.questions.slice(0, 3).filter((q) => typeof q === "string") : [];
    return { data: questions.length ? questions : null, error: null };
  } catch {
    return { data: null, error: null };
  }
}

/** Уточняющие вопросы при коротком описании. */
export async function getClarifyingQuestions(
  description: string
): Promise<{ data: string[] | null; error: string | null }> {
  if (!MISTRAL_API_KEY || description.trim().length >= CLARIFY_THRESHOLD) {
    return { data: null, error: null };
  }
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Пользователь кратко описал проект: «${description}». Сгенерируй 2–3 коротких уточняющих вопроса (да/нет), чтобы понять: нужен ли личный кабинет, онлайн-оплата, мультиязычность, чат и т.д. Верни СТРОГО JSON: { "questions": ["вопрос 1", "вопрос 2"] }. Только вопросы на русском.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 200,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return { data: null, error: null };
    const raw = JSON.parse(content.replace(/```json\s?/g, "").replace(/```/g, "").trim()) as { questions?: string[] };
    const questions = Array.isArray(raw.questions) ? raw.questions.slice(0, 3).filter((q) => typeof q === "string") : [];
    return { data: questions.length ? questions : null, error: null };
  } catch {
    return { data: null, error: null };
  }
}

/** Дополнение структуры по ответам на уточняющие вопросы. */
export async function refineStructure(
  description: string,
  answers: Record<number, boolean>
): Promise<{ addPages: string[]; addModules: string[]; pageLabels: Record<string, string>; moduleLabels: Record<string, string>; explanation: Record<string, string> }> {
  if (!MISTRAL_API_KEY) return { addPages: [], addModules: [], pageLabels: {}, moduleLabels: {}, explanation: {} };
  const answersStr = Object.entries(answers)
    .filter(([, v]) => v)
    .map(([i, v]) => `Ответ ${Number(i) + 1}: да`)
    .join("; ");
  if (!answersStr) return { addPages: [], addModules: [], pageLabels: {}, moduleLabels: {}, explanation: {} };
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Описание проекта: «${description}". Уточнения пользователя: ${answersStr}. Добавь ТОЛЬКО недостающие страницы и модули (id из тех же списков, что в основном промпте). Верни JSON: { "addPages": ["id"], "addModules": ["id"], "pageLabels": {}, "moduleLabels": {}, "explanation": {} }.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 400,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (!content) return { addPages: [], addModules: [], pageLabels: {}, moduleLabels: {}, explanation: {} };
    const raw = JSON.parse(content.replace(/```json\s?/g, "").replace(/```/g, "").trim()) as Record<string, unknown>;
    const addPages = Array.isArray(raw.addPages) ? raw.addPages.map(String) : [];
    const addModules = Array.isArray(raw.addModules) ? raw.addModules.map(String) : [];
    const pageLabels = typeof raw.pageLabels === "object" && raw.pageLabels ? (raw.pageLabels as Record<string, string>) : {};
    const moduleLabels = typeof raw.moduleLabels === "object" && raw.moduleLabels ? (raw.moduleLabels as Record<string, string>) : {};
    const explanation = typeof raw.explanation === "object" && raw.explanation ? (raw.explanation as Record<string, string>) : {};
    return { addPages, addModules, pageLabels, moduleLabels, explanation };
  } catch {
    return { addPages: [], addModules: [], pageLabels: {}, moduleLabels: {}, explanation: {} };
  }
}

/** Генерация краткого ТЗ по конфигу и описанию. */
export async function generateBrief(
  description: string,
  config: ProjectConfig
): Promise<{ text: string | null; error: string | null }> {
  if (!MISTRAL_API_KEY) return { text: null, error: "MISTRAL_API_KEY не настроен" };
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Напиши краткое техническое задание (1–2 абзаца) для разработки сайта/сервиса. Описание от заказчика: «${description}". Тип: ${config.projectType}. Страницы: ${config.pages.join(", ")}. Модули: ${config.modules.join(", ")}. Дизайн: ${config.designLevel}. Сроки: ${config.timeline}. Текст на русском, без markdown.`,
        },
      ],
      maxTokens: 500,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent.trim() : null;
    return { text: text || null, error: text ? null : "Пустой ответ" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка AI";
    return { text: null, error: message };
  }
}

/** Рекомендации: что ещё добавить (страницы/модули) с обоснованием. Учитывает весь собранный проект. */
export async function suggestRecommendations(params: {
  config: ProjectConfig;
  description?: string;
  brief?: BriefState | null;
}): Promise<{ pages: string[]; modules: string[]; reason: string }> {
  const { config, description = "", brief } = params;
  if (!MISTRAL_API_KEY) return { pages: [], modules: [], reason: "" };
  const pagesList = VALID_PAGE_IDS.join(", ");
  const modulesList = VALID_MODULE_IDS.join(", ");

  const contextParts: string[] = [
    `Тип проекта: ${config.projectType}.`,
    `Сроки: ${config.timeline}.`,
    `Страницы (уже выбраны): ${config.pages.length ? config.pages.join(", ") : "нет"}.`,
    `Модули (уже выбраны): ${config.modules.length ? config.modules.join(", ") : "нет"}.`,
  ];
  if (description.trim()) {
    contextParts.push(`Исходное описание заказчика: «${description.trim().slice(0, 600)}».`);
  }
  if (brief) {
    contextParts.push(`Стиль дизайна: ${brief.designStyle}.`);
    if (brief.uxOptions?.length) contextParts.push(`UX/интерактивность: ${brief.uxOptions.join(", ")}.`);
    if (brief.mainPageBlocks?.length) contextParts.push(`Блоки на главной: ${brief.mainPageBlocks.join(", ")}.`);
    if (brief.referenceUrls?.length) contextParts.push(`Референсы заказчика: ${brief.referenceUrls.slice(0, 3).join("; ")}.`);
    if (brief.paymentMethods?.length) contextParts.push(`Способы оплаты: ${brief.paymentMethods.join(", ")}.`);
    if (brief.integrations?.length) contextParts.push(`Интеграции: ${brief.integrations.join(", ")}.`);
    if (brief.notificationChannels?.length) contextParts.push(`Каналы уведомлений: ${brief.notificationChannels.join(", ")}.`);
    if (brief.comment?.trim()) contextParts.push(`Комментарий заказчика: «${brief.comment.trim().slice(0, 300)}».`);
  }
  const context = contextParts.join("\n");

  const userPrompt = `Ниже — полная картина собранного проекта. Проанализируй её и предложи, чего реально не хватает для успешного запуска: конверсии, удобства, полноты, юридической защиты, SEO, интеграций.

${context}

Допустимые id страниц (только из этого списка): ${pagesList}.
Допустимые id модулей (только из этого списка): ${modulesList}.

Правила:
- Предлагай только то, чего ещё НЕТ в текущих страницах и модулях.
- 0–3 страницы и 0–3 модуля максимум; только если они действительно уместны для этого проекта.
- reason — одно-два предложения на русском: зачем это нужно именно в этом проекте (конкретно, без воды).
- Если структура уже полная и ничего добавлять не нужно — верни пустые массивы и reason: "Структура проекта полная, дополнительных рекомендаций нет."

Верни СТРОГО JSON без markdown: { "pages": ["id1", ...], "modules": ["id1", ...], "reason": "текст обоснования" }.`;

  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [{ role: "user", content: userPrompt }],
      responseFormat: { type: "json_object" },
      maxTokens: 450,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text?: string }).text ?? "" : ""))
              .join("")
              .trim()
          : "";
    if (!content) return { pages: [], modules: [], reason: "" };
    const cleaned = content.replace(/```json\s?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { pages?: string[]; modules?: string[]; reason?: string };
    const pagesRaw = Array.isArray(parsed.pages) ? parsed.pages.filter((p) => typeof p === "string" && VALID_PAGE_IDS.includes(p as (typeof VALID_PAGE_IDS)[number])) : [];
    const modulesRaw = Array.isArray(parsed.modules) ? parsed.modules.filter((m) => typeof m === "string" && VALID_MODULE_IDS.includes(m as (typeof VALID_MODULE_IDS)[number])) : [];
    const pages = pagesRaw.filter((id) => !config.pages.includes(id));
    const modules = modulesRaw.filter((id) => !config.modules.includes(id));
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    return { pages, modules, reason };
  } catch {
    return { pages: [], modules: [], reason: "" };
  }
}

/** Чек-лист «Что подготовить к старту». */
export async function getLaunchChecklist(config: ProjectConfig): Promise<string[]> {
  if (!MISTRAL_API_KEY) return [];
  try {
    const { Mistral } = await import("@mistralai/mistralai");
    const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
    const result = await mistral.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: `Тип проекта: ${config.projectType}. Страницы: ${config.pages.join(", ")}. Модули: ${config.modules.join(", ")}. Составь короткий чек-лист «Что подготовить к старту проекта»: 4–6 пунктов на русском (домен, доступы, тексты, фото, логотип и т.д.). Верни СТРОГО JSON: { "items": ["пункт 1", "пункт 2", ...] }. Без markdown.`,
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 300,
    });
    const rawContent = result.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text?: string }).text ?? "" : ""))
              .join("")
              .trim()
          : "";
    if (!content) return [];
    const parsed = JSON.parse(content.replace(/```json\s?/g, "").replace(/```/g, "").trim()) as { items?: unknown[] };
    return Array.isArray(parsed.items) ? parsed.items.filter((i): i is string => typeof i === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
