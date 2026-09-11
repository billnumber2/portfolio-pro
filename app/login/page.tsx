"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  async function handleLogin(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoggingIn(true);
    setMessage("");
    setMessageType("");

    try {
      const normalizedEmail = email.trim();

      if (!normalizedEmail) {
        throw new Error("請輸入 Email。");
      }

      if (!password) {
        throw new Error("請輸入密碼。");
      }

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        throw error;
      }

      if (!data.user || !data.session) {
        throw new Error(
          "登入未完成，請確認帳號是否已完成 Email 驗證。"
        );
      }

      setMessageType("success");
      setMessage("登入成功，正在前往首頁...");

      router.replace("/");
      router.refresh();
    } catch (error: unknown) {
      console.error("Login failed:", error);

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "登入失敗，請檢查 Email 與密碼。"
      );
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7">
          <p className="text-sm font-semibold text-blue-600">
            Portfolio Pro
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            登入投資組合
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            請使用已在 Supabase Authentication
            建立的 Email 與密碼登入。
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="your-email@example.com"
              disabled={loggingIn}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              密碼
            </label>

            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="請輸入密碼"
              disabled={loggingIn}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loggingIn ? "登入中..." : "登入"}
          </button>
        </form>

        {message && (
          <div
            className={`mt-5 rounded-xl border p-4 text-sm ${
              messageType === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-xs leading-5 text-slate-500">
            此頁面僅提供登入，不開放自行註冊。登入帳號請由
            Supabase Authentication 後台建立。
          </p>
        </div>
      </section>
    </main>
  );
}