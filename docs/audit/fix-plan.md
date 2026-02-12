# План исправлений: TG Waitlist

**Дата:** 2026-02-12
**Приоритет:** Подготовка к запуску на 300-350к аудитории

Исправления разбиты на этапы по приоритету. Каждый этап должен быть завершён перед переходом к следующему.

---

## Этап 1: Критические исправления (блокеры запуска)

### 1.1. Верификация Telegram initData (VULN-001)

**Что сделать:**
Реализовать серверную проверку подписи `initData` по алгоритму Telegram.

**Файлы для изменения:**
- `src/app/api/submit-email/route.ts` — добавить проверку перед обработкой
- `src/lib/telegram-auth.ts` — новый файл, функция верификации

**Алгоритм (из документации Telegram):**
1. Клиент отправляет `initData` (строку из `window.Telegram.WebApp.initData`) в запросе
2. Сервер парсит `initData` как URL query string
3. Извлекает `hash` параметр, остальные параметры сортирует по ключу
4. Формирует data-check-string: `key=value\n` для каждого параметра (без `hash`)
5. Вычисляет `secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)`
6. Вычисляет `check_hash = HMAC-SHA256(secret_key, data_check_string)`
7. Сравнивает `check_hash` с `hash` из initData
8. Проверяет `auth_date` — не старше 5 минут

**Изменения в клиенте (`src/app/page.tsx`):**
- Добавить `initData` в тело POST-запроса:
  ```typescript
  body: JSON.stringify({
    initData: webapp.initData,  // добавить
    email: email.trim(),
    // telegram_user_id больше не нужен отдельно
  })
  ```

**Новая переменная окружения:**
- `TELEGRAM_BOT_TOKEN` — токен бота, через которого открывается WebApp

---

### 1.2. Исправление Race Condition (VULN-002)

**Что сделать:**
Заменить два отдельных запроса (COUNT + INSERT) на единую атомарную операцию.

**Вариант A (рекомендуется): INSERT с подзапросом проверки:**
```sql
INSERT INTO waitlist_entries (telegram_user_id, email)
SELECT $1, $2
WHERE (SELECT count(*) FROM waitlist_entries WHERE telegram_user_id = $1) < 10
RETURNING id;
```
Если вернёт 0 строк — лимит превышен.

**Вариант B: Partial unique index + ON CONFLICT:**
Добавить partial unique index, который ограничивает количество записей на уровне БД.

**Файлы:**
- `src/app/api/submit-email/route.ts` — переписать логику вставки
- `src/db/schema.ts` — добавить индекс (если вариант B)

---

### 1.3. Добавление Rate Limiting (VULN-003)

**Что сделать:**
Реализовать многоуровневый rate limiting.

**Уровень 1 — Vercel (рекомендуется):**
Использовать `@vercel/firewall` или Vercel WAF (Web Application Firewall) для:
- Глобальный лимит: 100 req/s на эндпоинт
- По IP: 10 req/min на IP-адрес

**Уровень 2 — Код приложения (запасной):**
Использовать Vercel KV (Redis) или Upstash Redis для in-memory rate limiting:
```
Ключ: `rl:ip:{ip_address}`
TTL: 60 секунд
Лимит: 5 запросов в минуту на IP
```

**Уровень 3 — Proxy (Nginx):**
Добавить в конфигурацию nginx:
```nginx
limit_req_zone $binary_remote_addr zone=submit:10m rate=5r/m;

location /api/submit-email {
    limit_req zone=submit burst=3 nodelay;
    ...
}
```

**Файлы:**
- `src/app/api/submit-email/route.ts` — добавить проверку rate limit
- `deploy/proxy/docker-compose.yml` — добавить nginx rate limiting
- `package.json` — добавить зависимость (если Upstash)

---

### 1.4. Индекс на telegram_user_id (производительность)

**Что сделать:**
Добавить индекс в схему БД.

**Файл:** `src/db/schema.ts`
```typescript
import { index } from "drizzle-orm/pg-core";

// В определении таблицы или отдельно:
export const telegramUserIdIdx = index("idx_waitlist_telegram_user_id")
  .on(waitlistEntries.telegramUserId);
```

**Применение:**
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Без этого индекса COUNT-запрос делает sequential scan, что при 60к+ записях будет критически медленно.

---

## Этап 2: Высокие исправления (важно для безопасности)

### 2.1. Настройка CORS (VULN-004)

**Что сделать:**
Ограничить origins для API-эндпоинта.

**Файл:** `src/app/api/submit-email/route.ts`

Добавить в начало функции POST:
```typescript
const origin = request.headers.get("origin");
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  `https://${process.env.PROXY_DOMAIN}`,
];

if (origin && !allowedOrigins.includes(origin)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Добавить OPTIONS handler для preflight:
```typescript
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL!,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
```

**Новые переменные окружения:**
- `NEXT_PUBLIC_APP_URL` — URL приложения на Vercel
- `PROXY_DOMAIN` — домен RU-прокси

---

### 2.2. Уникальное ограничение на (telegram_user_id, email) (VULN-005)

**Что сделать:**
Добавить unique index, чтобы один пользователь не мог отправить один и тот же email дважды.

**Файл:** `src/db/schema.ts`
```typescript
export const uniqueUserEmail = uniqueIndex("idx_unique_user_email")
  .on(waitlistEntries.telegramUserId, waitlistEntries.email);
```

**Файл:** `src/app/api/submit-email/route.ts`
Обработать ошибку `unique_violation` (код 23505) и вернуть адекватный ответ:
```typescript
if (error.code === "23505") {
  return NextResponse.json(
    { error: "This email has already been submitted" },
    { status: 409 }
  );
}
```

---

### 2.3. Валидация Content-Type (VULN-006)

**Файл:** `src/app/api/submit-email/route.ts`

Добавить в начало POST-хендлера:
```typescript
const contentType = request.headers.get("content-type");
if (!contentType?.includes("application/json")) {
  return NextResponse.json(
    { error: "Content-Type must be application/json" },
    { status: 415 }
  );
}
```

---

### 2.4. Лимит размера тела запроса (VULN-007)

**Файл:** `src/app/api/submit-email/route.ts`

**Вариант A — Next.js route segment config:**
```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1kb",
    },
  },
};
```

**Вариант B — Ручная проверка:**
```typescript
const contentLength = parseInt(request.headers.get("content-length") || "0");
if (contentLength > 1024) {
  return NextResponse.json({ error: "Payload too large" }, { status: 413 });
}
```

---

## Этап 3: Средние исправления (хардеринг)

### 3.1. Убрать детали из сообщений об ошибках (VULN-008)

**Файл:** `src/app/api/submit-email/route.ts`

Заменить:
```typescript
// Было:
{ error: "telegram_user_id is required and must be a positive number" }
{ error: "Maximum number of email entries reached (10)" }

// Стало:
{ error: "Invalid request" }
{ error: "Submission limit reached" }
```

---

### 3.2. Добавить Security Headers (VULN-009)

**Файл:** `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "ALLOW-FROM https://web.telegram.org" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; connect-src 'self'",
          },
        ],
      },
    ];
  },
};
```

---

### 3.3. Фильтрация заголовков в прокси (VULN-010)

**Файл:** `deploy/proxy/docker-compose.yml`

Добавить в nginx-конфигурацию:
```nginx
# Очистить потенциально опасные заголовки от клиента
proxy_set_header X-Forwarded-Host "";
proxy_set_header X-Original-URL "";
proxy_set_header X-Rewrite-URL "";

# Установить собственные
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;  # именно $remote_addr, не $proxy_add_x_forwarded_for
proxy_set_header X-Forwarded-Proto https;
```

---

### 3.4. Добавить мониторинг (VULN-011)

**Рекомендуемый стек:**
- **Vercel Analytics** (встроенный, для latency и error rate)
- **Sentry** (для отслеживания ошибок, бесплатный план)
- **UptimeRobot** или **Betterstack** (для uptime monitoring, бесплатный)

**Минимальный health check эндпоинт:**

**Новый файл:** `src/app/api/health/route.ts`
```typescript
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}
```

---

## Этап 4: Оптимизация для нагрузки

### 4.1. Оптимизация запросов к БД

**Текущее:** 2 запроса на submission (COUNT + INSERT)
**Цель:** 1 запрос на submission

Использовать raw SQL через Drizzle:
```typescript
const result = await db.execute(sql`
  INSERT INTO waitlist_entries (telegram_user_id, email)
  SELECT ${userId}, ${email}
  WHERE (SELECT count(*) FROM waitlist_entries WHERE telegram_user_id = ${userId}) < 10
  RETURNING id
`);
```

---

### 4.2. Настройка Nginx для нагрузки

**Файл:** `deploy/proxy/docker-compose.yml`

Добавить в начало nginx.conf (перед `server` блоком):
```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    keepalive_timeout 65;
    keepalive_requests 1000;

    # Rate limiting zone
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # Gzip
    gzip on;
    gzip_types application/json;

    upstream vercel {
        server ${TARGET_DOMAIN}:443;
        keepalive 32;
    }
    ...
}
```

Добавить replicas:
```yaml
services:
  tg-waitlist-proxy:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
```

---

### 4.3. Upgrade инфраструктуры

**Vercel:**
- Перейти на Pro план ($20/мес)
- Настроить Function Region ближе к Neon DB (по умолчанию обе в us-east-1)

**Neon:**
- Перейти минимум на Scale план
- Включить autoscaling (0.25 - 4 vCPU)
- Убедиться, что регион совпадает с регионом Vercel

---

### 4.4. Добавить response caching для повторных submissions

Для пользователей, которые уже успешно отправили email, можно кэшировать результат:
- При повторном submission того же email от того же пользователя — возвращать `200 OK` вместо повторной вставки (idempotent endpoint)
- Это снизит нагрузку на БД при повторных нажатиях кнопки

---

## Этап 5: Низкие исправления (улучшения)

### 5.1. Безопасное логирование (VULN-012)

**Файл:** `src/app/api/submit-email/route.ts`

Заменить:
```typescript
console.error("Failed to submit email:", error);
```
На:
```typescript
console.error("Failed to submit email:", error instanceof Error ? error.message : "Unknown error");
```

---

### 5.2. Альтернативный DNS для прокси (VULN-013)

**Файл:** `deploy/proxy/docker-compose.yml`

Заменить:
```nginx
resolver 8.8.8.8 1.1.1.0 valid=300s ipv6=off;
```
На (добавить Яндекс DNS как запасной для РФ):
```nginx
resolver 8.8.8.8 77.88.8.8 1.1.1.0 valid=300s ipv6=off;
```

---

### 5.3. Проверка disposable email (VULN-014, опционально)

Если качество данных важно, добавить проверку домена email по чёрному списку. Существуют npm-пакеты (`disposable-email-domains`) для этого.

---

## Чек-лист перед запуском

- [ ] **Этап 1 полностью завершён** (все КРИТИЧЕСКИЕ исправлены)
- [ ] **Этап 2 полностью завершён** (все ВЫСОКИЕ исправлены)
- [ ] Vercel на Pro-плане
- [ ] Neon на Scale-плане с autoscaling
- [ ] Индекс `telegram_user_id` создан и применён
- [ ] Unique index `(telegram_user_id, email)` создан
- [ ] Rate limiting работает (проверить вручную)
- [ ] Telegram initData верификация работает (проверить из реального Telegram бота)
- [ ] Прокси настроен с rate limiting и worker_processes
- [ ] Мониторинг включён (Vercel Analytics + health check)
- [ ] Нагрузочный тест проведён (минимум 100 RPS в течение 5 минут)
- [ ] Функциональный тест: отправка email из Telegram WebApp работает
- [ ] DNS для PROXY_DOMAIN работает и SSL сертификат получен
