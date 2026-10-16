"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CirclePlus,
  Clock3,
  FileText,
  Languages,
  LoaderCircle,
  Mic2,
  PenLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useDemoData } from "@/components/shared/demo-data-provider";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { UpdateProcessing } from "@/components/patient/update-processing";
import { UpdateReview } from "@/components/patient/update-review";
import {
  type PatientRecording,
  VoiceRecorder,
} from "@/components/patient/voice-recorder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { demoPatient } from "@/data/seed";
import { cn } from "@/lib/utils";
import type {
  StructuredPatientUpdate,
  TimelineEvent,
} from "@/server/types/domain";

type InputMode = "speak" | "write";
type PagePhase = "compose" | "processing" | "review" | "saved";

type ReviewResult = {
  structuredUpdate: StructuredPatientUpdate;
  event: TimelineEvent;
};

type TranscriptionPreview = {
  detectedLanguage?: string;
  originalTranscript: string;
  englishTranslation?: string;
  mode: "fallback" | "runware";
  notice?: string;
  persisted?: boolean;
};

type PatientUpdateSubmission = {
  patientId: string;
  originalText: string;
  translatedText?: string;
  recordedAt: string;
  sourceType: "text" | "voice";
  language?: string;
  severity?: number;
  categories: string[];
  transcriptionMode: "runware" | "fallback" | "typed";
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string };
};

const categoryOptions = [
  { value: "pain", label: "Pain" },
  { value: "sleep", label: "Sleep" },
  { value: "medication", label: "Medication" },
  { value: "work", label: "Work" },
  { value: "mobility", label: "Mobility" },
  { value: "mood", label: "Mood" },
] as const;

const delay = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function requestTranscription(
  recording: PatientRecording,
  preferredLanguage: string,
): Promise<TranscriptionPreview> {
  const formData = new FormData();
  formData.append("audio", recording.blob, "thread-recording.wav");
  formData.append("preferredLanguage", preferredLanguage);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as ApiEnvelope<{
    transcription: TranscriptionPreview;
  }>;

  if (!response.ok || !body.ok || !body.data) {
    throw new Error(body.error?.message ?? "Transcription was unavailable.");
  }

  return body.data.transcription;
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function sentencesFrom(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length ? sentences : [text.trim()];
}

function browserFallbackResult(input: {
  originalText: string;
  translatedText?: string;
  recordedAt: string;
  sourceType: "text" | "voice";
  severity: number | null;
  categories: string[];
  language?: string;
}): ReviewResult {
  const analysisText = input.translatedText ?? input.originalText;
  const lower = analysisText.toLowerCase();
  const extractedSeverity =
    input.severity ??
    (() => {
      const match = lower.match(/\b(10|[0-9])\s*(?:\/\s*10|out of ten)\b/);
      return match ? Number(match[1]) : undefined;
    })();
  const painMentioned =
    /pain|ache|dard|discomfort|hurt/.test(lower) ||
    input.categories.includes("pain");
  const pelvicPainMentioned = /pelvi|lower abdomen|pait ke neeche/.test(lower);
  const symptoms = [
    ...(painMentioned ? [pelvicPainMentioned ? "Pelvic pain" : "Pain"] : []),
    ...(/fatigue|tired/.test(lower) ? ["Fatigue"] : []),
    ...(/nausea|sick/.test(lower) ? ["Nausea"] : []),
  ];
  const bodyLocations = [
    ...(/pelvi/.test(lower) ? ["Pelvis"] : []),
    ...(/lower abdomen|pait ke neeche/.test(lower) ? ["Lower abdomen"] : []),
    ...(/lower back|kamar/.test(lower) ? ["Lower back"] : []),
    ...(/head|headache/.test(lower) ? ["Head"] : []),
    ...(/knee/.test(lower) ? ["Knee"] : []),
  ];
  const functionalImpacts = [
    ...(/work|shift/.test(lower) || input.categories.includes("work")
      ? ["Work affected"]
      : []),
    ...(/stand|standing|khari/.test(lower) ||
    input.categories.includes("mobility")
      ? ["Difficulty standing"]
      : []),
    ...(/sleep|night|woke|raat/.test(lower) ||
    input.categories.includes("sleep")
      ? ["Sleep interrupted"]
      : []),
  ];
  const medicationMentioned =
    /medication|naproxen|dose/.test(lower) ||
    input.categories.includes("medication");
  const nauseaMentioned = /nausea|feel sick/.test(lower);
  const questions = sentencesFrom(analysisText).filter((sentence) =>
    sentence.endsWith("?"),
  );
  const evidenceSentences = sentencesFrom(analysisText).map(
    (sentence, index) => {
      const sentenceLower = sentence.toLowerCase();
      const supports = [
        ...(/pain|ache|dard|discomfort|hurt/.test(sentenceLower)
          ? ["symptoms"]
          : []),
        ...(/\b(10|[0-9])\b/.test(sentenceLower) ? ["severity"] : []),
        ...(/pelvi|abdomen|back|kamar|head|knee/.test(sentenceLower)
          ? ["body location"]
          : []),
        ...(/work|shift|stand|sleep|night|woke/.test(sentenceLower)
          ? ["functional impact"]
          : []),
        ...(/medication|naproxen|dose|nausea/.test(sentenceLower)
          ? ["medication notes"]
          : []),
      ];
      return {
        id: `sentence-${index + 1}`,
        sentence,
        supports: supports.length ? supports : ["patient context"],
      };
    },
  );

  const structuredUpdate: StructuredPatientUpdate = {
    originalText: input.originalText,
    ...(input.translatedText ? { translatedText: input.translatedText } : {}),
    recordedAt: input.recordedAt,
    sourceKind: "patient_reported",
    symptoms: symptoms.length
      ? [...new Set(symptoms)]
      : ["Patient-described change"],
    ...(extractedSeverity === undefined ? {} : { severity: extractedSeverity }),
    bodyLocations: [...new Set(bodyLocations)],
    functionalImpacts: [...new Set(functionalImpacts)],
    ...(medicationMentioned || nauseaMentioned
      ? {
          medicationDetails: {
            ...(lower.includes("naproxen")
              ? { medicationName: "Naproxen" }
              : {}),
            action: /did not take|avoided/.test(lower)
              ? "Patient reports an avoided dose"
              : "Patient mentioned medication",
            adherence: /did not take|avoided/.test(lower)
              ? "Patient reports an avoided dose"
              : "No adherence change identified",
            reportedSideEffects: nauseaMentioned ? ["Nausea"] : [],
          },
          medicationNotes: [
            nauseaMentioned
              ? "Patient reports nausea associated with medication use."
              : "Patient mentioned medication in this update.",
          ],
        }
      : {}),
    ...(/sleep|night|woke|raat/.test(lower)
      ? { sleepImpact: "Patient reports interrupted or poor sleep." }
      : {}),
    questionsForNextAppointment: questions,
    evidenceSentences,
  };
  const event: TimelineEvent = {
    id: crypto.randomUUID(),
    patientId: demoPatient.id,
    type: input.sourceType === "voice" ? "patient_voice" : "patient_text",
    title:
      input.sourceType === "voice" ? "New voice update" : "New written update",
    summary:
      analysisText.length > 220
        ? `${analysisText.slice(0, 217)}…`
        : analysisText,
    recordedAt: input.recordedAt,
    sourceKind: "patient_reported",
    ...(input.language ? { language: input.language } : {}),
    originalText: input.originalText,
    ...(input.translatedText ? { translatedText: input.translatedText } : {}),
    ...(extractedSeverity === undefined ? {} : { severity: extractedSeverity }),
    bodyLocations: structuredUpdate.bodyLocations,
    symptoms: structuredUpdate.symptoms,
    functionalImpacts: structuredUpdate.functionalImpacts,
    ...(structuredUpdate.medicationDetails
      ? { medicationDetails: structuredUpdate.medicationDetails }
      : {}),
    metadata: {
      categories: input.categories,
      structuredUpdate,
      organisedBy: "Thread",
      clinicalVerificationStatus: "not_clinically_verified",
    },
  };

  return { structuredUpdate, event };
}

export default function PatientUpdatePage() {
  const { addEvent } = useDemoData();
  const [mode, setMode] = React.useState<InputMode>("speak");
  const [phase, setPhase] = React.useState<PagePhase>("compose");
  const [text, setText] = React.useState("");
  const [recording, setRecording] = React.useState<PatientRecording | null>(
    null,
  );
  const [recordingLanguage, setRecordingLanguage] = React.useState("English");
  const [categories, setCategories] = React.useState<string[]>([]);
  const [severity, setSeverity] = React.useState<number | null>(null);
  const [recordedAt, setRecordedAt] = React.useState(() =>
    localDateTimeValue(new Date()),
  );
  const [activeStep, setActiveStep] = React.useState(0);
  const [review, setReview] = React.useState<ReviewResult | null>(null);
  const [error, setError] = React.useState("");
  const [processingNotice, setProcessingNotice] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [durableSaved, setDurableSaved] = React.useState(false);
  const saveInFlightRef = React.useRef(false);
  const [transcription, setTranscription] =
    React.useState<TranscriptionPreview | null>(null);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [transcriptionError, setTranscriptionError] = React.useState("");
  const transcriptionRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    const applyHashPreference = () => {
      const hash = window.location.hash;
      if (hash === "#write" || hash === "#medication") setMode("write");
      if (hash === "#medication") setCategories(["medication"]);
    };
    const timer = window.setTimeout(applyHashPreference, 0);
    window.addEventListener("hashchange", applyHashPreference);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", applyHashPreference);
    };
  }, []);

  const toggleCategory = (category: string) => {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const transcribeRecording = React.useCallback(
    async (nextRecording: PatientRecording, preferredLanguage: string) => {
      const requestId = transcriptionRequestIdRef.current + 1;
      transcriptionRequestIdRef.current = requestId;
      setIsTranscribing(true);
      setTranscription(null);
      setTranscriptionError("");

      try {
        const result = await requestTranscription(
          nextRecording,
          preferredLanguage,
        );
        if (transcriptionRequestIdRef.current === requestId) {
          setTranscription(result);
        }
      } catch (requestError) {
        if (transcriptionRequestIdRef.current === requestId) {
          setTranscriptionError(
            requestError instanceof Error
              ? requestError.message
              : "Transcription was unavailable.",
          );
        }
      } finally {
        if (transcriptionRequestIdRef.current === requestId) {
          setIsTranscribing(false);
        }
      }
    },
    [],
  );

  const handleRecordingChange = (nextRecording: PatientRecording | null) => {
    setRecording(nextRecording);
    setError("");

    if (!nextRecording) {
      transcriptionRequestIdRef.current += 1;
      setTranscription(null);
      setTranscriptionError("");
      setIsTranscribing(false);
      return;
    }

    void transcribeRecording(nextRecording, recordingLanguage);
  };

  const handleRecordingLanguageChange = (language: string) => {
    setRecordingLanguage(language);
    if (recording) void transcribeRecording(recording, language);
  };

  const processUpdate = async () => {
    if (mode === "write" && text.trim().length < 3) {
      setError("Add a little more detail before Thread organises your update.");
      return;
    }
    if (mode === "speak" && !recording) {
      setError(
        "Record a voice update before continuing, or choose Write instead.",
      );
      return;
    }

    setError("");
    setSaveError("");
    setProcessingNotice("");
    setPhase("processing");
    setActiveStep(0);

    try {
      await delay(500);
      setActiveStep(1);

      let originalText = text.trim();
      let translatedText: string | undefined;
      let detectedLanguage = mode === "speak" ? recordingLanguage : "English";
      let transcriptionMode: PatientUpdateSubmission["transcriptionMode"] =
        mode === "speak" ? "runware" : "typed";

      if (mode === "speak" && recording) {
        try {
          const result =
            transcription ??
            (await requestTranscription(recording, recordingLanguage));
          originalText = result.originalTranscript;
          translatedText = result.englishTranslation;
          detectedLanguage = result.detectedLanguage ?? recordingLanguage;
          transcriptionMode = result.mode;
          if (result.mode === "fallback") {
            setProcessingNotice(
              result.notice ??
                "This is a synthetic demonstration transcript, not a transcription of your recording. It cannot be saved to your durable health story.",
            );
          } else if (result.notice) {
            setProcessingNotice(result.notice);
          }
        } catch (transcriptionFailure) {
          setPhase("compose");
          setError(
            transcriptionFailure instanceof Error
              ? transcriptionFailure.message
              : "Live transcription was unavailable. Thread will not invent spoken words. Try again, or choose Write instead.",
          );
          return;
        }
      } else {
        await delay(650);
      }

      setActiveStep(2);
      const eventDate = recordedAt
        ? new Date(recordedAt).toISOString()
        : new Date().toISOString();
      const sourceType = mode === "speak" ? "voice" : "text";
      const fallbackInput = {
        originalText,
        ...(translatedText ? { translatedText } : {}),
        recordedAt: eventDate,
        sourceType,
        severity,
        categories,
        ...(detectedLanguage ? { language: detectedLanguage } : {}),
      } as const;
      const submission: PatientUpdateSubmission = {
        patientId: demoPatient.id,
        originalText,
        ...(translatedText ? { translatedText } : {}),
        recordedAt: eventDate,
        sourceType,
        ...(detectedLanguage ? { language: detectedLanguage } : {}),
        ...(severity === null ? {} : { severity }),
        categories,
        transcriptionMode,
      };

      let result: ReviewResult;
      try {
        const [response] = await Promise.all([
          fetch("/api/patient-updates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...submission, save: false }),
          }),
          delay(750),
        ]);
        const body = (await response.json()) as ApiEnvelope<ReviewResult>;
        if (!response.ok || !body.ok || !body.data)
          throw new Error(
            body.error?.message ?? "The update could not be organised.",
          );
        result = body.data;
      } catch {
        result = browserFallbackResult(fallbackInput);
        result = {
          ...result,
          event: {
            ...result.event,
            metadata: {
              ...result.event.metadata,
              transcriptionMode,
              categories,
              structuredUpdate: result.structuredUpdate,
              organisedBy: "Thread",
              clinicalVerificationStatus: "not_clinically_verified",
            },
          },
        };
        setProcessingNotice(
          (current) =>
            current ||
            "The server organiser was unavailable, so a deterministic demonstration review was prepared in this browser. Saving still requires a durable server confirmation.",
        );
      }

      setActiveStep(3);
      await delay(700);
      setActiveStep(4);
      await delay(550);
      setReview(result);
      setPhase("review");
    } catch {
      setPhase("compose");
      setError(
        "Thread could not prepare that update. Your words have not been lost — please try again.",
      );
    }
  };

  const editReview = () => {
    if (review) {
      setText(review.structuredUpdate.originalText);
      setMode("write");
    }
    setPhase("compose");
  };

  const saveReview = async () => {
    if (!review || saveInFlightRef.current) return;

    const transcriptionMode = review.event.metadata?.transcriptionMode;
    if (transcriptionMode === "fallback") {
      setSaveError(
        "This transcript is synthetic demonstration text, not your recording. Thread will not save it as your spoken words. Record again when live transcription is available, or choose Write instead.",
      );
      toast.error("Synthetic transcript not saved", {
        description:
          "A durable health-story save requires a real transcription or a typed update.",
      });
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/patient-updates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review.event),
      });
      const body = (await response.json()) as ApiEnvelope<{
        event: TimelineEvent;
        saved: boolean;
        durable?: boolean;
      }>;
      if (!response.ok || !body.ok || !body.data?.saved) {
        throw new Error(
          body.error?.message ??
            "The update could not be saved to your health story.",
        );
      }

      addEvent(body.data.event);
      setDurableSaved(true);
      toast.success("Update saved to your timeline", {
        description:
          "Your confirmed patient-reported update is now part of your Thread.",
      });
      setPhase("saved");
    } catch (saveFailure) {
      const message =
        saveFailure instanceof Error
          ? saveFailure.message
          : "The update could not be saved to your health story.";
      setSaveError(message);
      setDurableSaved(false);
      toast.error("Save failed", {
        description: message,
      });
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const startAnother = () => {
    setText("");
    setRecording(null);
    setCategories([]);
    setSeverity(null);
    setRecordedAt(localDateTimeValue(new Date()));
    setReview(null);
    setTranscription(null);
    setTranscriptionError("");
    setIsTranscribing(false);
    setProcessingNotice("");
    setIsSaving(false);
    setSaveError("");
    setDurableSaved(false);
    setError("");
    setPhase("compose");
  };

  if (phase === "processing") {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-7 lg:px-8">
        <UpdateProcessing activeStep={activeStep} mode={mode} />
      </main>
    );
  }

  if (phase === "review" && review) {
    const isSynthetic = review.event.metadata?.transcriptionMode === "fallback";
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-7 sm:py-10 lg:px-8">
        {processingNotice ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {processingNotice}
          </div>
        ) : null}
        <UpdateReview
          structuredUpdate={review.structuredUpdate}
          event={review.event}
          onSave={saveReview}
          onEdit={editReview}
          onCancel={() => setPhase("compose")}
          saving={isSaving}
          saveDisabled={isSynthetic}
          saveDisabledReason={
            isSynthetic
              ? "Synthetic demonstration transcripts cannot be saved as your spoken words. Record again with live transcription, or use Write instead."
              : undefined
          }
          saveError={saveError}
        />
      </main>
    );
  }

  if (phase === "saved") {
    return (
      <main className="mx-auto flex w-full max-w-3xl items-center px-5 py-12 sm:min-h-[calc(100dvh-8rem)] sm:px-7 lg:px-8">
        <Card className="w-full overflow-hidden border-sage-200 bg-white text-center">
          <div className="bg-sage-50 px-6 py-10 sm:px-10 sm:py-12">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sage-600 text-white shadow-soft">
              <Check className="size-7" />
            </span>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-sage-700">
              {durableSaved ? "Saved to your Thread" : "Not saved durably"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
              {durableSaved
                ? "Your update is part of the story."
                : "This update was not confirmed."}
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
              {durableSaved
                ? "It is clearly marked as patient-reported. Thread has organised the details, but has not clinically verified them. Refresh the clinician view to see the same confirmed record."
                : "Thread did not write this update to the shared health story."}
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 p-5 sm:flex-row sm:p-6">
            <Button asChild>
              <Link href="/patient/timeline">
                View in timeline <ArrowRight />
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={startAnother}>
              <CirclePlus /> Add another
            </Button>
            <Button asChild variant="ghost">
              <Link href="/patient">Back to today</Link>
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-7 sm:py-10 lg:px-8">
      <header className="animate-fade-up">
        <Link
          href="/patient"
          className="inline-flex items-center gap-2 text-xs font-semibold text-plum-700 hover:text-plum-950"
        >
          <ArrowLeft className="size-4" /> Back to today
        </Link>
        <div className="mt-6 flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-plum-100 text-plum-700">
            <CirclePlus className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.11em] text-plum-500">
              Add a moment
            </p>
            <h1 className="mt-1 text-[clamp(2.1rem,8vw,3.7rem)] font-semibold leading-none tracking-[-.055em]">
              What feels important?
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Speak or write in your own words. Include only what you want to
              remember or bring into your next conversation.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
          role="alert"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <Card className="mt-7 overflow-hidden bg-white">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as InputMode);
            setError("");
          }}
        >
          <div className="border-b bg-[#fbf9f6] px-4 py-4 sm:px-6">
            <TabsList className="grid w-full grid-cols-2 sm:w-[22rem]">
              <TabsTrigger value="speak">
                <Mic2 className="mr-2 size-4" />
                Speak
              </TabsTrigger>
              <TabsTrigger value="write">
                <PenLine className="mr-2 size-4" />
                Write
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 sm:p-6">
            <TabsContent value="speak" className="mt-0">
              <VoiceRecorder
                onRecordingChange={handleRecordingChange}
                onUseWriting={() => setMode("write")}
              />

              {isTranscribing ? (
                <div
                  className="mt-4 flex items-center gap-3 rounded-2xl border border-plum-100 bg-plum-50/60 p-4"
                  role="status"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-plum-600 shadow-sm">
                    <LoaderCircle className="size-5 animate-spin" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-plum-950">
                      Transcribing your recording…
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Detecting the language and preserving your words.
                    </p>
                  </div>
                </div>
              ) : transcription ? (
                <div
                  className="mt-4 overflow-hidden rounded-2xl border border-sage-200 bg-sage-50/55"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sage-200 px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-sage-700 shadow-sm">
                        <Check className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-plum-950">
                          {transcription.mode === "runware"
                            ? "Transcript ready"
                            : "Live transcription unavailable"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Detected language:{" "}
                          {transcription.detectedLanguage ?? recordingLanguage}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        transcription.mode === "runware"
                          ? "clinical"
                          : "warning"
                      }
                    >
                      {transcription.mode === "runware"
                        ? "Live transcription"
                        : "Demo fallback"}
                    </Badge>
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-sage-700">
                      Original transcript
                    </p>
                    <p
                      dir="auto"
                      className="mt-2 whitespace-pre-wrap text-sm leading-7 text-plum-950 sm:text-base"
                    >
                      {transcription.originalTranscript}
                    </p>
                    {transcription.englishTranslation ? (
                      <div className="mt-4 border-t border-sage-200 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-sage-700">
                          English translation
                        </p>
                        <p className="mt-2 text-sm leading-6 text-plum-950">
                          {transcription.englishTranslation}
                        </p>
                      </div>
                    ) : null}
                    {transcription.notice ? (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                        {transcription.notice}
                      </p>
                    ) : null}
                    <p className="mt-4 rounded-xl bg-white px-3 py-2 text-[11px] font-medium leading-5 text-sage-800">
                      {transcription.mode === "runware"
                        ? "Provisional transcript only — review and confirm before this becomes part of your health story."
                        : "Synthetic demonstration text — this cannot be saved as your spoken words."}
                    </p>
                  </div>
                </div>
              ) : transcriptionError ? (
                <div
                  className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-800" />
                    <div>
                      <p className="text-sm font-semibold text-amber-950">
                        We could not transcribe that recording
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-900">
                        {transcriptionError}
                      </p>
                    </div>
                  </div>
                  {recording ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void transcribeRecording(recording, recordingLanguage)
                      }
                    >
                      <RefreshCw /> Try again
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="write" className="mt-0">
              <label htmlFor="patient-update" className="text-sm font-semibold">
                Tell it in your own words
              </label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                There is no special format. You will review anything Thread
                organises before it is saved.
              </p>
              <Textarea
                id="patient-update"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mt-4 min-h-56 resize-y border-plum-100 bg-[#fdfcfa] text-[15px] sm:min-h-64"
                placeholder="Tell Thread what happened, how you felt, whether anything changed and how it affected your day."
              />
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[.09em] text-muted-foreground">
                  Anything this relates to?{" "}
                  <span className="font-normal normal-case tracking-normal">
                    Optional
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {categoryOptions.map((category) => {
                    const selected = categories.includes(category.value);
                    return (
                      <button
                        key={category.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleCategory(category.value)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
                          selected
                            ? "border-plum-500 bg-plum-700 text-white"
                            : "border-plum-100 bg-white text-muted-foreground hover:bg-plum-50 hover:text-plum-700",
                        )}
                      >
                        {selected ? (
                          <Check className="mr-1.5 inline size-3" />
                        ) : null}
                        {category.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#faf8f5] p-4">
                <label
                  htmlFor="update-time"
                  className="flex items-center gap-2 text-xs font-semibold"
                >
                  <CalendarClock className="size-4 text-plum-600" />
                  When did this happen?
                </label>
                <input
                  id="update-time"
                  type="datetime-local"
                  value={recordedAt}
                  onChange={(event) => setRecordedAt(event.target.value)}
                  className="mt-3 h-10 w-full rounded-xl border bg-white px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-200"
                />
              </div>
              <div className="rounded-2xl bg-[#faf8f5] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <Sparkles className="size-4 text-plum-600" />
                    Severity{" "}
                    <span className="font-normal text-muted-foreground">
                      optional
                    </span>
                  </p>
                  {severity !== null ? (
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-muted-foreground hover:text-plum-700"
                      onClick={() => setSeverity(null)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {severity === null ? (
                  <button
                    type="button"
                    onClick={() => setSeverity(5)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-dashed bg-white text-xs font-semibold text-plum-700 hover:bg-plum-50"
                  >
                    Add a 0–10 rating
                  </button>
                ) : (
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      aria-label="Reported severity from 0 to 10"
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={severity}
                      onChange={(event) =>
                        setSeverity(Number(event.target.value))
                      }
                      className="h-2 flex-1 accent-[#794561]"
                    />
                    <Badge
                      variant={severity >= 7 ? "warning" : "patient"}
                      className="min-w-12 justify-center"
                    >
                      {severity}/10
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                <Clock3 className="size-3.5 shrink-0" /> Usually ready to review
                in a few seconds.
              </div>
              <Button
                type="button"
                className="p-3"
                size="lg"
                onClick={processUpdate}
                disabled={
                  mode === "speak"
                    ? !recording || isTranscribing
                    : text.trim().length < 3
                }
              >
                {mode === "speak" ? <Mic2 /> : <FileText />} Process update{" "}
                <ArrowRight />
              </Button>
            </div>
          </div>
        </Tabs>
      </Card>

      <div className="mt-5 rounded-2xl border border-plum-100 bg-white/55 p-4">
        <p className="text-xs font-semibold text-plum-900">
          You stay in control
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Thread does not diagnose or decide what your update means clinically.
          It organises what you report and asks you to review it before saving.
        </p>
      </div>
      <SafetyNotice className="mx-auto mt-5 max-w-2xl" compact />
    </main>
  );
}
