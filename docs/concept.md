# Концепция проекта: TG Waitlist

## Суть продукта

Telegram WebApp с одной страницей, которая собирает email-адреса пользователей.
Приложение открывается внутри Telegram через механизм Web Apps и адаптируется
под тему оформления пользователя (светлая/темная).

## Пользовательский сценарий

1. Пользователь открывает WebApp внутри Telegram (через бота или ссылку)
2. Видит страницу с призывом оставить email для связи
3. Вводит email в поле ввода
4. Нажимает MainButton (нативная кнопка Telegram WebApp внизу экрана)
5. Email сохраняется в базе данных
6. Пользователь видит подтверждение успешной отправки

## Технический стек

- **Фронтенд + бэкенд**: Next.js (App Router)
- **База данных**: Neon (serverless PostgreSQL от Vercel)
- **ORM**: Drizzle ORM (легковесный, type-safe, отлично работает с Neon)
- **Деплой**: Vercel
- **Telegram SDK**: @twa-dev/sdk (обертка над Telegram WebApp API)

## Интеграция с Telegram WebApp

- Используем `window.Telegram.WebApp` для получения данных пользователя
- `initDataUnsafe.user.id` - получаем telegram user_id
- Тема оформления берется из CSS-переменных Telegram (`var(--tg-theme-bg-color)`, `var(--tg-theme-text-color)` и т.д.)
- `MainButton` - нативная кнопка Telegram внизу экрана, используется для отправки формы
- `HapticFeedback` - тактильная отдача при нажатии (на поддерживаемых устройствах)

## Модель данных

Одна таблица `waitlist_entries`:

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | Уникальный идентификатор записи (PK) |
| telegram_user_id | BIGINT | ID пользователя в Telegram |
| email | VARCHAR(255) | Email-адрес пользователя |
| created_at | TIMESTAMP | Время создания записи |

## Бизнес-правила

- Один пользователь может оставить до 10 email-адресов (например, менять email)
- При попытке добавить 11-й - возвращается ошибка с понятным сообщением
- Email проходит базовую валидацию на клиенте и на сервере
- telegram_user_id обязателен (приложение работает только внутри Telegram)

## Структура проекта (Next.js App Router)

```
src/
  app/
    page.tsx          # Главная (и единственная) страница
    layout.tsx        # Корневой layout с подключением Telegram SDK
    globals.css       # Глобальные стили с CSS-переменными Telegram
    api/
      submit-email/
        route.ts      # API endpoint для сохранения email
  db/
    schema.ts         # Drizzle-схема таблицы
    index.ts          # Подключение к Neon
  lib/
    telegram.ts       # Утилиты для работы с Telegram WebApp
```

## Переменные окружения

- `DATABASE_URL` - строка подключения к Neon PostgreSQL

## Деплой

Проект деплоится на Vercel одной командой или через привязку GitHub-репозитория.
Neon database создается через Vercel Integration или вручную на neon.tech.
