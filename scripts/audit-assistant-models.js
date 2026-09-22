// Read-only audit of stored assistant values that upstream now rejects. Lists every offending
// row so a human can repair it by hand; it makes no writes and takes no flags.
//   node scripts/audit-assistant-models.js
//
// Exit 1 when any row matched, 0 otherwise, so it can gate a deploy.
// Every allowlist is imported from src/assistant/assistant.rules.js — never restated here,
// because a restated copy is exactly what drifts. The dead-value lists below are the audit's
// own targets (values that were removed from those allowlists).
const mongoose = require('mongoose');
const connectDB = require('../src/core/db/dbConnect');
const Assistant = require('../src/core/db/schemas/assistant.model');
const {
  SARVAM_SPEAKERS,
  SARVAM_TTS_LANGUAGES,
  ELEVENLABS_TTS_MODELS,
} = require('../src/assistant/assistant.rules');

// Upstream answers 422 for these: the *-chat-latest aliases retired on 2026-06-19, chat-latest
// and gpt-oss-120b are not served by api.openai.com, and gemini-live-2.5-flash-native-audio is
// the Vertex-only id.
const DEAD_LLM_MODELS = [
  'gemini-live-2.5-flash-native-audio',
  'gpt-5.1-chat-latest',
  'gpt-5.2-chat-latest',
  'gpt-5.3-chat-latest',
  'chat-latest',
  'gpt-oss-120b',
];

// saaras:v2.5 / saarika:v2.5 were sunset by Sarvam; nova-2 lost its published price and
// upstream prices every call it accepts.
const DEAD_STT_MODELS = ['saaras:v2.5', 'saarika:v2.5', 'nova-2'];

const isSet = (value) => value !== undefined && value !== null && value !== '';

const findingsFor = (assistant) => {
  const findings = [];
  const id = assistant.external_assistant_id;
  const llmModel = assistant.llm_config?.model;

  if (DEAD_LLM_MODELS.includes(llmModel)) {
    findings.push([id, 'llm_config.model', llmModel, 'retired / never served by api.openai.com (upstream 422)']);
  }

  const sttModel = assistant.stt_config?.model;
  if (DEAD_STT_MODELS.includes(sttModel)) {
    findings.push([id, 'stt_config.model', sttModel, 'sunset by the provider or unpriced (upstream 422)']);
  }

  if (String(assistant.tts_model || '').toLowerCase() === 'sarvam') {
    const speaker = assistant.tts_config?.speaker;
    if (isSet(speaker) && !SARVAM_SPEAKERS.includes(String(speaker))) {
      findings.push([id, 'tts_config.speaker', speaker, 'not on the bulbul:v3 roster — the call ends before it starts']);
    }

    const code = assistant.tts_config?.target_language_code;
    if (isSet(code) && !SARVAM_TTS_LANGUAGES.includes(String(code))) {
      findings.push([id, 'tts_config.target_language_code', code, 'not spoken by bulbul:v3 — substituted with en-IN upstream']);
    }
  }

  if (String(assistant.tts_model || '').toLowerCase() === 'elevenlabs') {
    const ttsModel = assistant.tts_config?.model;
    if (isSet(ttsModel) && !ELEVENLABS_TTS_MODELS.includes(String(ttsModel))) {
      findings.push([id, 'tts_config.model', ttsModel, 'not an ElevenLabs TTS model upstream accepts (upstream 422)']);
    }
  }

  return findings;
};

const run = async () => {
  await connectDB();

  const rows = await Assistant.find(
    {},
    { external_assistant_id: 1, llm_config: 1, stt_config: 1, tts_config: 1, tts_model: 1 }
  ).lean();

  let matched = 0;
  for (const assistant of rows) {
    for (const [id, field, value, why] of findingsFor(assistant)) {
      matched += 1;
      console.log(`${id} ${field} ${value} ${why}`);
    }
  }

  if (matched > 0) {
    console.log(
      `\n${matched} stored value(s) upstream now rejects. Repair each with ` +
      'PATCH /assistant/update/{assistant_id}, sending the corrected field. A rename-only PATCH ' +
      'still works — resolvePairForUpdate carries the stored config through untouched, so the ' +
      'record is never locked.'
    );
  } else {
    console.log('No stored model, speaker or language value is outside the current allowlists.');
  }

  await mongoose.disconnect();
  process.exit(matched > 0 ? 1 : 0);
};

run().catch(async (err) => {
  console.error(`audit-assistant-models failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
