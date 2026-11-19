# Scope — Exotel recording proxy endpoint

## User request (verbatim)

````text
export async function downloadExotelRecording(recordingUrl: string): Promise<{ audio: Buffer; mimeType: string }> {
  if (!isAllowedExotelRecordingUrl(recordingUrl)) {
    throw new Error("The recording URL is not an allowed HTTPS provider URL.");
  }
  const response = await fetchRecordingResponse(recordingUrl);
  if (!response.ok) {
    const responseText = await response.text();
    const getXmlField = (field: string): string => {
      const match = responseText.match(
        new RegExp(<(?:(?:[\\w.-]+):)?${field}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${field}\\s*>, "i"),
      );
      return match?.[1]
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, "&")
        .trim() ?? "";
    };
    let jsonError: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        jsonError = parsed as Record<string, unknown>;
      }
    } catch {
      jsonError = {};
    }
    const providerCode = response.headers.get("x-amz-error-code") ||
      getXmlField("Code") ||
      (typeof jsonError.Code === "string" ? jsonError.Code : "");
    const providerMessage = getXmlField("Message") ||
      (typeof jsonError.Message === "string" ? jsonError.Message : "") ||
      (typeof jsonError.message === "string" ? jsonError.message : "");
    const queryValues = [...new URL(recordingUrl).searchParams.values()];
    const detail = sanitizeProviderMessage(
      [providerCode, providerMessage].filter(Boolean).join(": "),
      [
        process.env.EXOTEL_SID ?? "",
        process.env.EXOTEL_API_KEY ?? "",
        process.env.EXOTEL_API_TOKEN ?? "",
        process.env.EXOTEL_WEBHOOK_SECRET ?? "",
        recordingUrl,
        ...queryValues,
      ],
    );
    const rawContentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const contentType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(rawContentType) ? rawContentType : "";
    const diagnostics = [contentType, detail].filter(Boolean).join("; ");
    throw new ExotelRecordingError(
      The recording provider returned HTTP ${response.status}${diagnostics ?  (${diagnostics}) : ""}.,
      response.status,
      "download",
    );
  }
  const responseType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const mimeType = responseType.startsWith("audio/") || responseType === "application/octet-stream"
    ? responseType
    : "audio/mpeg";
  return { audio: await readRecordingBody(response), mimeType };
}

sends authentication details to exotel

async function fetchRecordingResponse(recordingUrl: string): Promise<Response> {
  const apiKey = process.env.EXOTEL_API_KEY?.trim();
  const apiToken = process.env.EXOTEL_API_TOKEN?.trim();
  if (!apiKey || !apiToken) throw new Error("Telephony credentials are not configured for recording retrieval.");


  let url = new URL(recordingUrl);
  if (!isAllowedExotelRecordingUrl(url)) throw new Error("The recording URL is not an allowed HTTPS provider URL.");
  const authorization = Basic ${Buffer.from(${apiKey}:${apiToken}).toString("base64")};


  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const isExotelHost = isExotelRecordingHost(url.hostname);
    const response = await fetch(url, {
      headers: isExotelHost ? { Authorization: authorization } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;


    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("The Exotel recording redirect was invalid or exceeded the allowed limit.");
    const redirectedUrl = new URL(location, url);
    if (!isAllowedExotelRecordingUrl(redirectedUrl)) {
      throw new Error("The Exotel recording redirected to an untrusted host.");
    }
    url = redirectedUrl;
  }
  throw new Error("The Exotel recording redirect could not be followed.");
}






save the recording in supabse storage

export async function saveExotelRecording(
  call: { id: string; org_id: string },
  recordingUrl: string,
  durationSeconds: number,
): Promise<void> {
  if (!isAllowedExotelRecordingUrl(recordingUrl)) {
    throw new Error("The recording URL is not an allowed Exotel HTTPS URL.");
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 86400) {
    throw new Error("Invalid recording duration.");
  }


  const admin = createSupabaseAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("org_settings")
    .select("recording_retention_days")
    .eq("org_id", call.org_id)
    .maybeSingle();
  if (settingsError) throw new Error(Could not load recording retention settings: ${settingsError.message});


  const retentionDays = settings?.recording_retention_days ?? 180;
  const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
  const { error: pendingError } = await admin.from("recordings").upsert(
    {
      org_id: call.org_id,
      call_id: call.id,
      storage_path: pending:${call.id},
      duration_seconds: Math.max(durationSeconds, 1),
      mime_type: "audio/mpeg",
      status: "pending",
      uploaded_at: null,
      retention_until: retentionUntil,
    },
    { onConflict: "call_id" }
  );
  if (pendingError) throw new Error(Could not mark the recording as pending: ${pendingError.message});


  try {
    const { audio, mimeType } = await downloadExotelRecording(recordingUrl);
    const storagePath = ${call.org_id}/${call.id}/recording;
    const { error: uploadError } = await admin.storage
      .from(exotelRecordingBucket)
      .upload(storagePath, audio, { contentType: mimeType, upsert: true });
    if (uploadError) throw new Error(Could not upload the recording to Supabase Storage: ${uploadError.message});


    const { error: readyError } = await admin.from("recordings").upsert(
      {
        org_id: call.org_id,
        call_id: call.id,
        storage_path: supabase:${storagePath},
        duration_seconds: Math.max(durationSeconds, 1),
        mime_type: mimeType,
        status: "ready",
        uploaded_at: new Date().toISOString(),
        retention_until: retentionUntil,
      },
      { onConflict: "call_id" }
    );
    if (readyError) throw new Error(The audio was uploaded, but recording metadata could not be finalized: ${readyError.message});
  } catch (error: unknown) {
    const failureMessage = error instanceof Error ? error.message : "The recording could not be stored.";
    const { error: failedError } = await admin.from("recordings").upsert(
      {
        org_id: call.org_id,
        call_id: call.id,
        storage_path: pending:${call.id},
        duration_seconds: Math.max(durationSeconds, 1),
        mime_type: "audio/mpeg",
        status: "failed",
        uploaded_at: null,
        retention_until: retentionUntil,
      },
      { onConflict: "call_id" }
    );
    if (failedError) {
      throw new Error(${failureMessage} The recording failure state could not be saved: ${failedError.message});
    }
    throw error;
  }
} curl.exe --verbose --location --fail `
  --output "recordings\62d88ab4808bc871aa7800a99e7b1abi.mp3" `
  "https://recordings.mum1.exotel.com/exotelrecordings/lokaviveka1m/62d88ab4808bc871aa7800a99e7b1abi.mp3"  make an api with this code that is going to call exotel and bring the call recording.
````

## Scope questions and answers

| Question | Answer |
|---|---|
| Where should the recording be stored? | Stream only — no persistence. |
| How is the API triggered? | Authenticated `POST` with the recording URL in the body. |
| Exotel auth? | Always require `EXOTEL_API_KEY` / `EXOTEL_API_TOKEN`. |
| `org_id` / `org_settings` mapping? | Initially "add MongoDB org settings"; corrected by the user: "no storing required you dont have to match with the code just make an api" — no org settings. |
| Success response? | Binary MP3 bytes with correct headers. |

## Out of scope

Supabase, `org_settings`, retention, metadata tables, GridFS, Exotel webhook, call-id lookup, changes to
LiveKit proxy behaviour, git commits.
