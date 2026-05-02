import { NextRequest, NextResponse } from "next/server";
import { getAssistantAuth } from "@/lib/assistant/auth";
import { transcribeForAssistant } from "@/lib/assistant/voice/stt";
import { textToSpeechBase64 } from "@/lib/assistant/voice/tts";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = new Set(["audio/wav", "audio/webm", "audio/x-wav"]);

const ROMANIAN_ONLY_MESSAGE = "Momentan pot conversa doar în limba română.";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAssistantAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Necesită autentificare." }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Lipsește formularul cu audio." }, { status: 400 });
    }

    const audioFile = formData.get("audio");
    if (!audioFile || typeof audioFile === "string") {
      return NextResponse.json({ error: "Lipsește fișierul audio." }, { status: 400 });
    }

    const file = audioFile as File;
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Fișierul audio este prea mare. Maxim 5MB." },
        { status: 400 }
      );
    }

    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      return NextResponse.json(
        { error: "Format audio invalid. Folosește WAV sau WebM." },
        { status: 400 }
      );
    }

    const conversationId = (formData.get("conversationId") as string) || undefined;
    const transcribeOnly = formData.get("transcribeOnly") === "true";
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "audio.webm";

    let text: string;
    let detectedLanguage: string;
    try {
      const sttResult = await transcribeForAssistant(buffer, filename);
      text = sttResult.text;
      detectedLanguage = sttResult.detectedLanguage;
    } catch {
      return NextResponse.json(
        { error: "Nu am putut transcrie audio. Încearcă din nou sau scrie mesajul." },
        { status: 400 }
      );
    }

    const trimmedText = text?.trim() ?? "";

    if (transcribeOnly) {
      if (!trimmedText) {
        return NextResponse.json(
          { error: "Nu s-a detectat vorbire. Încearcă din nou." },
          { status: 400 }
        );
      }
      return NextResponse.json({ text: trimmedText });
    }

    if (detectedLanguage !== "ro") {
      const audioBase64 = await textToSpeechBase64(ROMANIAN_ONLY_MESSAGE);
      return NextResponse.json({
        message: ROMANIAN_ONLY_MESSAGE,
        ...(audioBase64 ? { audioBase64 } : {}),
      });
    }

    if (!trimmedText) {
      return NextResponse.json(
        { error: "Nu s-a detectat vorbire. Încearcă din nou." },
        { status: 400 }
      );
    }

    const chatUrl = new URL(request.url).origin + "/api/assistant/chat";
    const chatRequest = new NextRequest(chatUrl, {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: request.headers.get("Authorization") ?? "",
      }),
      body: JSON.stringify({ conversationId, message: text }),
    });

    const { POST: chatPost } = await import("@/app/api/assistant/chat/route");
    const chatResponse = await chatPost(chatRequest);

    if (!chatResponse.ok) {
      const errBody = await chatResponse.json().catch(() => ({}));
      const message = (errBody as { error?: string }).error ?? "Eroare la asistent.";
      return NextResponse.json(
        { error: message },
        { status: chatResponse.status }
      );
    }

    const data = (await chatResponse.json()) as {
      conversationId?: string;
      message?: string;
      quickReplies?: string[];
      draftProgress?: unknown;
      uiAction?: unknown;
    };

    const message = typeof data.message === "string" ? data.message : "";
    const audioBase64 = await textToSpeechBase64(message);

    return NextResponse.json({
      ...(data.conversationId != null ? { conversationId: data.conversationId } : {}),
      message,
      ...(data.quickReplies != null ? { quickReplies: data.quickReplies } : {}),
      ...(data.draftProgress != null ? { draftProgress: data.draftProgress } : {}),
      ...(data.uiAction != null ? { uiAction: data.uiAction } : {}),
      ...(audioBase64 ? { audioBase64 } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare la procesare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[assistant/voice]", msg);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
