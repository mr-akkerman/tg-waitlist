"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getTelegramWebApp, getTelegramUserId } from "@/lib/telegram";

type AppState = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<AppState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const mainButtonCallbackRef = useRef<(() => void) | null>(null);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSubmit = useCallback(async () => {
    if (!telegramUserId || !isValidEmail(email)) return;

    const webapp = getTelegramWebApp();
    setState("loading");
    setErrorMessage("");

    if (webapp) {
      webapp.MainButton.showProgress(true);
      webapp.HapticFeedback.selectionChanged();
    }

    try {
      const res = await fetch("/api/submit-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_user_id: telegramUserId,
          email: email.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setState("success");
      if (webapp) {
        webapp.MainButton.hideProgress();
        webapp.MainButton.hide();
        webapp.HapticFeedback.notificationOccurred("success");
      }
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong"
      );
      if (webapp) {
        webapp.MainButton.hideProgress();
        webapp.HapticFeedback.notificationOccurred("error");
      }
    }
  }, [email, telegramUserId]);

  // Initialize Telegram WebApp
  useEffect(() => {
    const webapp = getTelegramWebApp();
    if (webapp) {
      webapp.ready();
      webapp.expand();
      const userId = getTelegramUserId();
      setTelegramUserId(userId);
    }
  }, []);

  // Manage MainButton
  useEffect(() => {
    const webapp = getTelegramWebApp();
    if (!webapp) return;

    // Clean up previous callback
    if (mainButtonCallbackRef.current) {
      webapp.MainButton.offClick(mainButtonCallbackRef.current);
    }

    if (state === "success") {
      webapp.MainButton.hide();
      return;
    }

    const valid = isValidEmail(email) && telegramUserId !== null;

    webapp.MainButton.setParams({
      text: "Отправить",
      is_active: valid && state !== "loading",
      is_visible: true,
    });

    if (valid && state !== "loading") {
      const callback = () => {
        handleSubmit();
      };
      mainButtonCallbackRef.current = callback;
      webapp.MainButton.onClick(callback);
    } else {
      mainButtonCallbackRef.current = null;
    }

    return () => {
      if (mainButtonCallbackRef.current) {
        webapp.MainButton.offClick(mainButtonCallbackRef.current);
      }
    };
  }, [email, state, telegramUserId, handleSubmit]);

  if (state === "success") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
        <div className="animate-scale-in flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--tg-button)", color: "var(--tg-button-text)" }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--tg-text)" }}
          >
            Готово!
          </h1>
          <p
            className="max-w-[260px] text-base leading-relaxed"
            style={{ color: "var(--tg-hint)" }}
          >
            Спасибо, мы сохранили ваш email. Будем на связи!
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center px-6">
      <div className="mx-auto w-full max-w-sm">
        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <div
            className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--tg-secondary-bg)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--tg-button)" }}
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <h1
            className="text-[28px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--tg-text)" }}
          >
            Оставайся на связи
          </h1>
        </div>

        {/* Description */}
        <p
          className="animate-fade-in-up animate-delay-100 mb-8 text-[15px] leading-relaxed"
          style={{ color: "var(--tg-hint)" }}
        >
          Оставь свой email, и мы напишем тебе, когда все будет готово. Никакого
          спама, только важные обновления.
        </p>

        {/* Input */}
        <div className="animate-fade-in-up animate-delay-200">
          <label
            className="mb-2 block text-[13px] font-medium uppercase tracking-wider"
            style={{ color: "var(--tg-hint)" }}
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state === "error") {
                setState("idle");
                setErrorMessage("");
              }
            }}
            disabled={state === "loading"}
            className="w-full rounded-xl border px-4 py-3.5 text-base outline-none transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: "var(--tg-secondary-bg)",
              color: "var(--tg-text)",
              borderColor: state === "error"
                ? "#ef4444"
                : email && isValidEmail(email)
                  ? "var(--tg-button)"
                  : "transparent",
            }}
          />

          {/* Error message */}
          {state === "error" && errorMessage && (
            <p className="mt-2 text-sm" style={{ color: "#ef4444" }}>
              {errorMessage}
            </p>
          )}
        </div>

        {/* Loading indicator */}
        {state === "loading" && (
          <div className="animate-fade-in-up mt-4 flex items-center gap-2">
            <div
              className="h-1.5 w-1.5 rounded-full animate-pulse-soft"
              style={{ backgroundColor: "var(--tg-button)" }}
            />
            <span
              className="text-sm animate-pulse-soft"
              style={{ color: "var(--tg-hint)" }}
            >
              Сохраняем...
            </span>
          </div>
        )}

        {/* Hint for non-Telegram env */}
        {telegramUserId === null && (
          <p
            className="animate-fade-in-up animate-delay-300 mt-6 text-center text-[13px]"
            style={{ color: "var(--tg-hint)" }}
          >
            Откройте это приложение через Telegram
          </p>
        )}
      </div>
    </main>
  );
}
