# План реализации: TG Waitlist

## Шаг 1. Инициализация проекта Next.js

- Инициализировать Next.js проект с TypeScript и App Router
- Настроить `tsconfig.json`
- Добавить в `.gitignore` стандартные записи для Next.js
- Убедиться что проект запускается локально

**Результат**: рабочий пустой Next.js проект

## Шаг 2. Установка зависимостей

- `@neondatabase/serverless` - драйвер для подключения к Neon
- `drizzle-orm` - ORM для работы с базой
- `drizzle-kit` - утилиты для миграций
- `uuid` + `@types/uuid` - генерация UUID (или использовать `crypto.randomUUID()`)

**Результат**: все зависимости установлены

## Шаг 3. Настройка базы данных

- Создать файл `src/db/schema.ts` со схемой таблицы `waitlist_entries`
  - `id` (UUID, primary key, default: gen_random_uuid())
  - `telegram_user_id` (bigint, not null)
  - `email` (varchar 255, not null)
  - `created_at` (timestamp, default: now())
- Создать файл `src/db/index.ts` с подключением к Neon через `DATABASE_URL`
- Создать `drizzle.config.ts` для настройки миграций
- Сгенерировать SQL-миграцию

**Результат**: схема БД готова, миграция создана

## Шаг 4. API endpoint для сохранения email

- Создать `src/app/api/submit-email/route.ts`
- Реализовать POST-обработчик:
  - Принимает JSON: `{ telegram_user_id: number, email: string }`
  - Валидация email (регулярное выражение)
  - Валидация telegram_user_id (число, больше 0)
  - Проверка: у пользователя не более 10 записей в БД
  - Если все ок - вставка записи в таблицу
  - Возврат JSON-ответа с результатом
- Обработка ошибок с понятными сообщениями

**Результат**: рабочий API endpoint

## Шаг 5. Утилиты для Telegram WebApp

- Создать `src/lib/telegram.ts`
- Функция получения данных пользователя из `window.Telegram.WebApp`
- Типы для Telegram WebApp API (или использовать `@twa-dev/types`)
- Функции-обертки для MainButton (показать, скрыть, установить текст, обработчик клика)
- Функция для HapticFeedback

**Результат**: удобные утилиты для работы с Telegram API

## Шаг 6. Глобальные стили и layout

- Создать `src/app/globals.css`:
  - Применить CSS-переменные Telegram (`--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-button-color`, `--tg-theme-button-text-color`, `--tg-theme-hint-color`, `--tg-theme-secondary-bg-color`)
  - Базовые стили для body, input, кнопок
  - Стили адаптивные под мобильные экраны
- Создать `src/app/layout.tsx`:
  - Подключить скрипт Telegram WebApp (`https://telegram.org/js/telegram-web-app.js`)
  - Метатеги viewport для корректного отображения в WebApp
  - Подключить globals.css

**Результат**: стили адаптированы под тему Telegram

## Шаг 7. Главная страница

- Создать `src/app/page.tsx` (клиентский компонент - `"use client"`)
- Верстка:
  - Заголовок / приветствие
  - Текст с призывом оставить email
  - Поле ввода email (стилизованное под тему Telegram)
  - Состояния: ввод, загрузка, успех, ошибка
- Логика:
  - При монтировании: инициализация Telegram WebApp, получение user_id
  - Показать MainButton с текстом "Отправить"
  - По клику на MainButton: отправить POST-запрос на `/api/submit-email`
  - При успехе: показать сообщение "Спасибо! Email сохранен"
  - При ошибке: показать сообщение об ошибке
  - Использовать HapticFeedback для отклика

**Результат**: полностью рабочая страница

## Шаг 8. Конфигурация для деплоя на Vercel

- Убедиться что `next.config.js` корректен
- Создать `.env.example` с переменной `DATABASE_URL`
- Проверить что проект собирается без ошибок (`npm run build`)

**Результат**: проект готов к деплою

## Шаг 9. Финальная проверка

- Проверить сборку проекта
- Проверить что API endpoint корректно обрабатывает запросы
- Проверить валидацию (некорректный email, лимит 10 записей, отсутствие user_id)
- Проверить что TypeScript компилируется без ошибок
- Убедиться что нет захардкоженных секретов в коде

**Результат**: проект готов к продакшену

## Порядок файлов для создания

1. `package.json` (через `npx create-next-app`)
2. `src/db/schema.ts`
3. `src/db/index.ts`
4. `drizzle.config.ts`
5. `src/lib/telegram.ts`
6. `src/app/globals.css`
7. `src/app/layout.tsx`
8. `src/app/page.tsx`
9. `src/app/api/submit-email/route.ts`
10. `.env.example`
