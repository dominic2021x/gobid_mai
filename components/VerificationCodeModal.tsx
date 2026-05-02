"use client";

import { type ClipboardEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonWithIcon } from "@/components/ui/button-with-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

interface VerificationCodeModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
  onVerify: (code: string, markCodeAccepted?: () => void) => Promise<void>;
  onResend?: () => Promise<void>;
  isDarkMode?: boolean;
}

export default function VerificationCodeModal({
  isOpen,
  email,
  onClose,
  onVerify,
  onResend,
  isDarkMode = false,
}: VerificationCodeModalProps) {
  const [code, setCode] = useState(Array.from({ length: CODE_LENGTH }, () => ""));
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<"idle" | "success" | "error">("idle");
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const codeValue = useMemo(() => code.join(""), [code]);
  const canResend = countdown <= 0 && Boolean(onResend) && !isResending;

  useEffect(() => {
    if (!isOpen) return;
    setCode(Array.from({ length: CODE_LENGTH }, () => ""));
    setError(null);
    setVerificationState("idle");
    setCountdown(RESEND_SECONDS);
    window.setTimeout(() => firstInputRef.current?.focus(), 80);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, isOpen]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const rest = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  };

  const focusInput = (index: number) => {
    document.getElementById(`code-${index}`)?.focus();
  };

  const extractOtpDigits = (rawValue: string) => {
    const exactCode = rawValue.match(/\d{6}/)?.[0];
    if (exactCode) return exactCode;
    return rawValue.replace(/\D/g, "").slice(0, CODE_LENGTH);
  };

  const submitCode = async (verificationCode = codeValue) => {
    if (verificationCode.length !== CODE_LENGTH) {
      setError(`Codul trebuie să aibă ${CODE_LENGTH} cifre.`);
      setVerificationState("error");
      return;
    }

    setIsVerifying(true);
    setError(null);
    setVerificationState("idle");

    try {
      await onVerify(verificationCode, () => {
        setVerificationState("success");
        setError(null);
      });
      setVerificationState("success");
    } catch (err: any) {
      setError(err?.message || "Cod incorect. Te rugăm să încerci din nou.");
      setVerificationState("error");
      setCode(Array.from({ length: CODE_LENGTH }, () => ""));
      window.setTimeout(() => firstInputRef.current?.focus(), 40);
    } finally {
      setIsVerifying(false);
    }
  };

  const applyDigits = (rawValue: string, index: number) => {
    const digits = extractOtpDigits(rawValue);
    if (!digits) {
      const nextCode = [...code];
      nextCode[index] = "";
      setCode(nextCode);
      setError(null);
      setVerificationState("idle");
      return;
    }

    if (digits.length === CODE_LENGTH) {
      const nextCode = digits.split("");
      setCode(nextCode);
      setError(null);
      setVerificationState("idle");
      focusInput(CODE_LENGTH - 1);
      window.setTimeout(() => {
        void submitCode(digits);
      }, 0);
      return;
    }

    const startIndex = digits.length === CODE_LENGTH ? 0 : index;
    const nextCode = [...code];
    for (let offset = 0; offset < digits.length && startIndex + offset < CODE_LENGTH; offset += 1) {
      nextCode[startIndex + offset] = digits[offset] ?? "";
    }
    setCode(nextCode);
    setError(null);
    setVerificationState("idle");

    const nextValue = nextCode.join("");
    if (nextValue.length === CODE_LENGTH && nextCode.every(Boolean)) {
      focusInput(CODE_LENGTH - 1);
      void submitCode(nextValue);
      return;
    }

    focusInput(Math.min(startIndex + digits.length, CODE_LENGTH - 1));
  };

  const handleCodeChange = (index: number, value: string) => {
    applyDigits(value, index);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      focusInput(index - 1);
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    }
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData("text"), index);
  };

  const handleResend = async () => {
    if (!canResend || !onResend) return;

    setIsResending(true);
    setError(null);
    setVerificationState("idle");

    try {
      await onResend();
      setCountdown(RESEND_SECONDS);
      setCode(Array.from({ length: CODE_LENGTH }, () => ""));
      window.setTimeout(() => firstInputRef.current?.focus(), 40);
    } catch (err: any) {
      setError(err?.message || "Eroare la retrimiterea codului.");
      setVerificationState("error");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border p-0 shadow-2xl sm:max-w-md",
          isDarkMode
            ? "border-white/15 bg-black text-white shadow-black/60"
            : "border-neutral-200 bg-white text-black shadow-black/20",
        )}
      >
        <div
          className={cn(
            "relative px-6 pb-6 pt-7",
            isDarkMode
              ? "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%),linear-gradient(180deg,#171717,#000000)]"
              : "bg-[radial-gradient(circle_at_top,rgba(0,0,0,0.08),transparent_42%),linear-gradient(180deg,#ffffff,#f5f5f5)]",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl shadow-lg",
              isDarkMode ? "bg-white text-black shadow-white/10" : "bg-black text-white shadow-black/20",
            )}
          >
            <MailCheck className="size-7" aria-hidden />
          </div>

          <DialogHeader className="mb-4 text-center">
            <DialogTitle className="text-xl font-semibold">Verificare cod OTP</DialogTitle>
            <DialogDescription className={cn("mt-1 text-sm", isDarkMode ? "text-neutral-300" : "text-neutral-600")}>
              Introdu codul de {CODE_LENGTH} cifre trimis la <strong className="font-semibold">{email}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "mx-auto mb-5 flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
              isDarkMode ? "bg-white/10 text-neutral-200" : "bg-neutral-100 text-neutral-700",
            )}
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Pasul 1 din 1: verifică-ți contul
          </div>

          <form
            className="mb-4 flex justify-center gap-2 sm:gap-3"
            autoComplete="one-time-code"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            {code.map((digit, index) => (
              <Input
                key={index}
                id={`code-${index}`}
                name={index === 0 ? "one-time-code" : `one-time-code-${index + 1}`}
                ref={index === 0 ? firstInputRef : undefined}
                value={digit}
                type="text"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                pattern="[0-9]*"
                enterKeyHint={index === CODE_LENGTH - 1 ? "done" : "next"}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={index === 0 ? CODE_LENGTH : 1}
                aria-label={`Cifra ${index + 1} din codul de verificare`}
                aria-invalid={Boolean(error)}
                disabled={isVerifying}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={(e) => handlePaste(index, e)}
                className={cn(
                  "size-11 rounded-xl p-0 text-center text-lg font-semibold shadow-sm sm:size-14 sm:text-xl",
                  "focus-visible:ring-2",
                  isDarkMode
                    ? "border-white/20 bg-white/10 text-white focus-visible:border-white focus-visible:ring-white/30"
                    : "border-neutral-200 bg-white text-black focus-visible:border-black focus-visible:ring-black/20",
                  verificationState === "success" &&
                    "border-emerald-500 text-emerald-700 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 dark:text-emerald-300",
                  verificationState === "error" &&
                    "border-red-500 text-red-700 focus-visible:border-red-500 focus-visible:ring-red-500/30 dark:text-red-300",
                  error &&
                    (isDarkMode
                      ? "border-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/30"
                      : "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30"),
                )}
              />
            ))}
          </form>

          {!canResend ? (
            <p className={cn("mb-3 text-center text-xs", isDarkMode ? "text-neutral-400" : "text-neutral-600")}>
              Poți retrimite codul în <strong>{formatTime(countdown)}</strong>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <ButtonWithIcon
              type="button"
              tone={
                verificationState === "success"
                  ? "success"
                  : verificationState === "error"
                    ? "error"
                    : "default"
              }
              label={
                isVerifying
                  ? "Se verifică..."
                  : verificationState === "success"
                    ? "Cod corect"
                    : verificationState === "error"
                      ? "Cod incorect"
                      : "Verifică OTP"
              }
              icon={
                isVerifying ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )
              }
              disabled={isVerifying || code.some((digit) => digit === "")}
              onClick={() => void submitCode()}
            />

            {onResend ? (
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-11 w-full justify-between rounded-xl",
                  isDarkMode
                    ? "border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    : "border-neutral-200 bg-white text-black hover:bg-neutral-100",
                )}
                onClick={() => void handleResend()}
                disabled={!canResend}
              >
                <span>{isResending ? "Se retrimite..." : canResend ? "Trimite din nou" : "Retrimite OTP"}</span>
                {!canResend ? (
                  <span className={cn("text-xs", isDarkMode ? "text-neutral-400" : "text-neutral-500")}>
                    {formatTime(countdown)}
                  </span>
                ) : null}
              </Button>
            ) : null}
          </div>

          {error ? (
            <p
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-center text-sm",
                isDarkMode ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {error}
            </p>
          ) : null}
          {verificationState === "success" && !error ? (
            <p
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-center text-sm font-medium",
                isDarkMode
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
            >
              Cod corect. Îți pregătim contul...
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

