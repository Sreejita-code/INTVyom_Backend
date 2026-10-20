/**
 * Pure TTS rules mirrored from upstream — no I/O. ElevenLabs models and per-model voice_settings,
 * and the two Sarvam Bulbul generations (bulbul:v3, bulbul:v4-flash) with their rosters and limits.
 *
 * Source: api-livekit-docs `reference/models.md` ("TTS") and `api/assistant/create.md`, read
 * 2026-10-20 (upstream 1.6.0). Upstream answers 422 for everything refused here; mirroring it
 * means a bad value fails with a readable 400 instead of an unwrapped upstream body. When
 * upstream adds a model or speaker, change this file only.
 */
const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const quotedList = (values) => values.map((v) => `'${v}'`).join(', ');
const isSet = (value) => value !== undefined && value !== null && value !== '';

// --- ElevenLabs -------------------------------------------------------------------------------

const ELEVENLABS_DEFAULT_MODEL = 'eleven_v3';

// Which voice_settings each model reads. ElevenLabs itself accepts and ignores the rest, so a
// stored value would look like it was shaping the voice; upstream refuses them with a 422.
const ELEVENLABS_VOICE_SETTINGS_BY_MODEL = {
  eleven_v3: ['stability'],
  eleven_v3_conversational: ['stability', 'use_speaker_boost'],
  eleven_v4: ['stability', 'similarity_boost'],
  eleven_v4_turbo: ['stability', 'similarity_boost'],
  eleven_turbo_v2_5: ['stability', 'similarity_boost', 'speed'],
  eleven_flash_v2_5: ['stability', 'similarity_boost', 'speed'],
  eleven_multilingual_v2: ['stability', 'similarity_boost', 'style', 'speed', 'use_speaker_boost'],
};

const ELEVENLABS_TTS_MODELS = Object.keys(ELEVENLABS_VOICE_SETTINGS_BY_MODEL);

const ELEVENLABS_VOICE_SETTING_KEYS = ['stability', 'similarity_boost', 'style', 'speed', 'use_speaker_boost'];

const assertElevenLabsModelAllowed = (model) => {
  if (!isSet(model) || ELEVENLABS_TTS_MODELS.includes(String(model))) return;
  throw badRequest(
    `'elevenlabs' does not have a TTS model called '${model}' — choose one of: ` +
    `${quotedList(ELEVENLABS_TTS_MODELS)}`
  );
};

const assertElevenLabsVoiceSettings = (model, voiceSettings) => {
  if (!voiceSettings || typeof voiceSettings !== 'object') return;

  const effectiveModel = isSet(model) ? String(model) : ELEVENLABS_DEFAULT_MODEL;
  const read = ELEVENLABS_VOICE_SETTINGS_BY_MODEL[effectiveModel];
  if (!read) return; // unknown model: assertElevenLabsModelAllowed reports it

  for (const [key, value] of Object.entries(voiceSettings)) {
    if (!ELEVENLABS_VOICE_SETTING_KEYS.includes(key)) {
      throw badRequest(
        `assistant_tts_config.voice_settings.${key} is not an ElevenLabs voice setting — ` +
        `choose from: ${quotedList(ELEVENLABS_VOICE_SETTING_KEYS)}`
      );
    }
    if (value === null || value === undefined || read.includes(key)) continue;

    const readBy = ELEVENLABS_TTS_MODELS.filter((m) => ELEVENLABS_VOICE_SETTINGS_BY_MODEL[m].includes(key));
    throw badRequest(
      `${effectiveModel} does not read voice_settings ${key}. Remove it, or pick a model that ` +
      `reads it (${key}: ${readBy.join(', ')}). ${effectiveModel} reads: ${read.join(', ')}`
    );
  }
};

// --- Sarvam Bulbul ----------------------------------------------------------------------------

const SARVAM_DEFAULT_MODEL = 'bulbul:v3';
const SARVAM_V4_FLASH = 'bulbul:v4-flash';
const SARVAM_TTS_MODELS = [SARVAM_DEFAULT_MODEL, SARVAM_V4_FLASH];

// The 30 bulbul:v3 speakers. No two Bulbul generations share a speaker name: every v2 name
// (`anushka`, `manisha`, `vidya`, `arya`, `abhilash`, `karun`, `hitesh`) is invalid on v3 too.
const SARVAM_V3_SPEAKERS = [
  'aayan', 'aditya', 'advait', 'amelia', 'amit', 'ashutosh', 'dev', 'ishita', 'kabir',
  'kavitha', 'kavya', 'manan', 'neha', 'pooja', 'priya', 'rahul', 'ratan', 'ritu', 'rohan',
  'roopa', 'rupali', 'shreya', 'shruti', 'shubh', 'simran', 'sophia', 'suhani', 'sumit',
  'tanya', 'varun',
];

// The 224 bulbul:v4-flash speakers, `<voice>_<language>_<style>`, grouped by language tag.
const SARVAM_V4_FLASH_SPEAKERS_BY_LANGUAGE = {
  as: ['kangkana_as_conversational', 'mouchumi_as_conversational'],
  bn: ['bappa_bn_conversation', 'bimal_bn_suspense', 'roopa_bn_conversational'],
  en: [
    'aditi_en_stories', 'amelia_en_conversational', 'aparna_en_companion', 'aparna_en_edtech',
    'ashwin_en_sports', 'ashwin_en_sports_energetic', 'chandrika_en_stories', 'dev_en_conversational',
    'dev_en_recovery', 'deven_en_conversation', 'girish_en_devotional', 'girish_en_documentary',
    'ishita_en_customer', 'ishita_en_medical', 'ishita_en_numbers', 'ishita_en_social',
    'ishita_en_stories', 'kalpit_en_edtech', 'nachiket_en_ads', 'neha_en_customer',
    'neha_en_latenight', 'nupur_en_kids', 'ojas_en_social', 'payal_en_edtech', 'ritu_en_edtech',
    'ritu_en_latenight', 'ritu_en_medical', 'ritu_en_reels', 'rohan_en_recovery',
    'roopa_en_conversational', 'rustom_en_suspense', 'sanchita_en_companion',
    'sanchita_en_insurance', 'sanchita_en_market', 'sanchita_en_recovery', 'sanchita_en_social',
    'sarang_en_narration', 'shabana_en_edtech', 'shalini_en_companion', 'shalini_en_customer',
    'shubh_en_ads', 'shubh_en_audiobook', 'shubh_en_narration', 'shubh_en_narration_gentle',
    'shubh_en_numbers', 'shubh_en_recovery', 'shubh_en_sports', 'simran_en_ads',
    'simran_en_automobile', 'simran_en_conversation', 'simran_en_customer', 'simran_en_edtech',
    'simran_en_edtech_bot', 'simran_en_narration', 'simran_en_recovery', 'simran_en_sales',
    'simran_en_therapist', 'sophia_en_conversational', 'sunny_en_social', 'varun_en_ads',
    'varun_en_suspense', 'zarina_en_conversation',
  ],
  enhi: [
    'ishita_enhi_companion', 'ishita_enhi_customer', 'ishita_enhi_customer_expressive',
    'sanchita_enhi_companion', 'shalini_enhi_companion', 'shalini_enhi_customer',
    'shubh_enhi_ads', 'shubh_enhi_banking', 'shubh_enhi_companion',
    'simran_enhi_banking_expressive', 'simran_enhi_companion', 'simran_enhi_customer',
    'sunny_enhi_customer',
  ],
  gu: ['bhavik_gu_conversation', 'pooja_gu_conversational', 'pooja_gu_customer'],
  hi: [
    'aarti_hi_customer', 'aayan_hi_conversational', 'aditya_hi_conversational', 'aditya_hi_sales',
    'advait_hi_character', 'amit_hi_conversational', 'anand_hi_documentary', 'anand_hi_news',
    'aparna_hi_customer', 'aparna_hi_kyc', 'aryaman_hi_ads', 'ashok_hi_character', 'ashok_hi_news',
    'ashutosh_hi_conversational', 'chaitra_hi_customer', 'chhavi_hi_kids', 'chirag_hi_social',
    'girish_hi_devotional', 'ishita_hi_ads', 'ishita_hi_ads_informal', 'ishita_hi_banking',
    'ishita_hi_devotional', 'ishita_hi_edtech', 'ishita_hi_numbers', 'ishita_hi_social',
    'kabir_hi_conversational', 'kavya_hi_conversational', 'kunal_hi_kids', 'mahesh_hi_documentary',
    'manan_hi_conversational', 'mani_hi_conversational', 'mani_hi_devotional',
    'mohit_hi_conversational', 'mukul_hi_ads', 'mukul_hi_suspense', 'nachiket_hi_devotional',
    'priya_hi_recovery', 'rahul_hi_conversational', 'ratan_hi_customer_expressive',
    'ratan_hi_devotional', 'ratan_hi_documentary', 'ratan_hi_latenight', 'ratan_hi_latenight_warm',
    'ratan_hi_recovery', 'ratan_hi_social', 'ratan_hi_sports', 'rehan_hi_social',
    'ritu_hi_ads_formal', 'ritu_hi_ads_informal', 'ritu_hi_banking', 'ritu_hi_conversation',
    'ritu_hi_customer', 'ritu_hi_customer_utility', 'ritu_hi_customer_warm', 'ritu_hi_edtech',
    'ritu_hi_edtech_bot', 'ritu_hi_insurance', 'ritu_hi_kids', 'ritu_hi_medical', 'ritu_hi_reels',
    'ritu_hi_sales', 'ritu_hi_social', 'ritu_hi_social_lively', 'roopa_hi_companion',
    'roopa_hi_conversational', 'roopa_hi_market', 'roopa_hi_narration', 'roopa_hi_recovery',
    'sanchita_hi_ads_formal', 'sanchita_hi_ads_informal', 'sanchita_hi_assistant',
    'sanchita_hi_banking', 'sanchita_hi_edtech', 'sanchita_hi_feedback', 'sanchita_hi_interview',
    'sanchita_hi_kyc', 'sanchita_hi_market', 'sanchita_hi_romantic', 'sanchita_hi_social',
    'sarika_hi_conversation', 'shalini_hi_companion', 'shalini_hi_social', 'shilpa_hi_narration',
    'shreya_hi_conversational', 'shreya_hi_news', 'shruti_hi_edtech', 'shubh_hi_ads',
    'shubh_hi_customer', 'shubh_hi_devotional', 'shubh_hi_ecomm', 'shubh_hi_recovery',
    'shubh_hi_stories_dramatic', 'shubh_hi_stories_mixed', 'simran_hi_assistant',
    'simran_hi_automobile', 'simran_hi_conversation', 'simran_hi_latenight', 'simran_hi_narration',
    'simran_hi_news', 'simran_hi_news_breaking', 'simran_hi_recovery', 'simran_hi_sales',
    'simran_hi_social_energetic', 'simran_hi_social_excited', 'suchitra_hi_ecomm',
    'suhani_hi_social', 'suman_hi_companion', 'sumit_hi_conversational', 'sunny_hi_ads',
    'sunny_hi_reels', 'tanya_hi_narration', 'tarun_hi_conversational', 'tarun_hi_sales',
    'vaibhav_hi_social', 'vandana_hi_ecomm', 'vipul_hi_social',
  ],
  kn: ['chaitra_kn_conversation', 'chaitra_kn_narration', 'chetan_kn_conversation', 'suchitra_kn_narration'],
  mr: [
    'ishita_mr_conversational', 'mrunal_mr_narration', 'mukul_mr_stories', 'neha_mr_narration',
    'nilesh_mr_conversation', 'ritu_mr_insurance', 'ritu_mr_narration', 'rupali_mr_stories',
    'soham_mr_narration',
  ],
  pa: ['anand_pa_conversation', 'anand_pa_customer', 'harpreet_pa_narration', 'jaspal_pa_banking'],
  ta: ['gokul_ta_narration', 'vetri_ta_ads', 'vetri_ta_suspense', 'vijay_ta_narration'],
  te: ['kavitha_te_conversation', 'kavitha_te_narration', 'pooja_te_conversation', 'tarun_te_narration'],
};

const SARVAM_V4_FLASH_SPEAKERS = Object.values(SARVAM_V4_FLASH_SPEAKERS_BY_LANGUAGE).flat();

// Every Bulbul model speaks these 11 languages — note `en-IN`, not `en-US`. An unlisted code is
// replaced with `en-IN` upstream, so the assistant would speak a language nobody chose.
const SARVAM_TTS_LANGUAGES = [
  'bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN',
];
// bulbul:v4-flash also speaks these 12, on a Sarvam subscription that has them enabled (that
// part is not checkable here). On bulbul:v3 one of them is a 422.
const SARVAM_V4_FLASH_EXTRA_LANGUAGES = [
  'as-IN', 'brx-IN', 'doi-IN', 'kok-IN', 'ks-IN', 'mai-IN', 'mni-IN', 'ne-IN', 'sa-IN', 'sat-IN',
  'sd-IN', 'ur-IN',
];

const SARVAM_LIMITS = {
  [SARVAM_DEFAULT_MODEL]: {
    pace: [0.3, 3.0],
    sampleRates: [8000, 16000, 22050, 24000, 32000, 44100, 48000],
    temperature: [0.01, 2.0],
  },
  [SARVAM_V4_FLASH]: {
    pace: [0.5, 2.0],
    sampleRates: [8000, 16000, 22050, 24000],
    temperature: null, // Sarvam fixes it at 0.6 on v4-flash
  },
};

const sarvamModelOf = (config, storedConfig) =>
  String(config?.model ?? storedConfig?.model ?? SARVAM_DEFAULT_MODEL);

const sarvamSpeakersFor = (model) =>
  model === SARVAM_V4_FLASH ? SARVAM_V4_FLASH_SPEAKERS : SARVAM_V3_SPEAKERS;

const sarvamLanguagesFor = (model) =>
  model === SARVAM_V4_FLASH ? [...SARVAM_TTS_LANGUAGES, ...SARVAM_V4_FLASH_EXTRA_LANGUAGES] : SARVAM_TTS_LANGUAGES;

const assertSarvamModelAllowed = (model) => {
  if (!isSet(model) || SARVAM_TTS_MODELS.includes(String(model))) return;
  throw badRequest(
    `'sarvam' does not have a TTS model called '${model}' — choose one of: ${quotedList(SARVAM_TTS_MODELS)}`
  );
};

// `model` is the effective Sarvam model: the request's, else the stored one, else bulbul:v3.
const assertSarvamSpeakerAllowed = (ttsProvider, speaker, model = SARVAM_DEFAULT_MODEL) => {
  if (!isSet(speaker) || String(ttsProvider || '').toLowerCase() !== 'sarvam') return;

  const roster = sarvamSpeakersFor(model);
  if (roster.includes(String(speaker))) return;

  // Name the v4-flash voices built on the same name, as upstream does.
  const builtOnSameName = model === SARVAM_V4_FLASH
    ? []
    : SARVAM_V4_FLASH_SPEAKERS.filter((s) => s.startsWith(`${speaker}_`));
  const hint = builtOnSameName.length
    ? ` '${speaker}' is a bulbul:v3 voice; ${SARVAM_V4_FLASH} voices built on it: ${builtOnSameName.slice(0, 8).join(', ')}.`
    : '';
  const sample = model === SARVAM_V4_FLASH
    ? `${roster.length} speakers named <voice>_<language>_<style>, such as 'shubh_hi_customer'`
    : quotedList(roster);
  throw badRequest(
    `Sarvam speaker '${speaker}' is not available on ${model} — v2, v3 and v4-flash share no ` +
    `speaker names; ${model} speakers are: ${sample}.${hint} Update assistant_tts_config.speaker.`
  );
};

const assertSarvamTargetLanguageAllowed = (ttsProvider, code, model = SARVAM_DEFAULT_MODEL) => {
  if (!isSet(code) || String(ttsProvider || '').toLowerCase() !== 'sarvam') return;
  if (sarvamLanguagesFor(model).includes(String(code))) return;

  const needsV4 = model !== SARVAM_V4_FLASH && SARVAM_V4_FLASH_EXTRA_LANGUAGES.includes(String(code));
  throw badRequest(
    needsV4
      ? `Sarvam target_language_code '${code}' is not spoken by ${model} (only ${SARVAM_V4_FLASH} speaks it) — ` +
        `set assistant_tts_config.model to '${SARVAM_V4_FLASH}', or choose one of: ${quotedList(SARVAM_TTS_LANGUAGES)}`
      : `Sarvam target_language_code '${code}' is not spoken by ${model} — choose one of: ` +
        `${quotedList(sarvamLanguagesFor(model))}. Note 'en-IN', not 'en-US'.`
  );
};

// pace, speech_sample_rate and temperature differ per Bulbul generation.
const assertSarvamLimits = (config, model) => {
  const limits = SARVAM_LIMITS[model];
  if (!limits || !config) return;

  const { pace, speech_sample_rate: rate, temperature } = config;

  if (isSet(pace) && !(Number.isFinite(pace) && pace >= limits.pace[0] && pace <= limits.pace[1])) {
    throw badRequest(`Sarvam pace must be between ${limits.pace[0]} and ${limits.pace[1]} on ${model}`);
  }
  if (isSet(rate) && !limits.sampleRates.includes(rate)) {
    throw badRequest(`Sarvam speech_sample_rate on ${model} must be one of: ${limits.sampleRates.join(', ')}`);
  }
  if (isSet(temperature)) {
    if (!limits.temperature) {
      throw badRequest(
        `Sarvam temperature is not accepted on ${model}, where Sarvam fixes it at 0.6 — remove it`
      );
    }
    const [low, high] = limits.temperature;
    if (!(Number.isFinite(temperature) && temperature >= low && temperature <= high)) {
      throw badRequest(`Sarvam temperature must be between ${low} and ${high} on ${model}`);
    }
  }
};

// --- Entry point ------------------------------------------------------------------------------

/**
 * Check the request-carried part of an assistant_tts_config against upstream's rules.
 * `storedConfig` is the stored config of the SAME provider (or undefined): a request that sends
 * only `speaker` is judged against the stored Sarvam model.
 */
const assertTtsConfigAllowed = (ttsProvider, config, storedConfig) => {
  if (!config) return;
  const provider = String(ttsProvider || '').toLowerCase();

  if (provider === 'elevenlabs') {
    assertElevenLabsModelAllowed(config.model);
    assertElevenLabsVoiceSettings(config.model ?? storedConfig?.model, config.voice_settings);
  }

  if (provider === 'sarvam') {
    assertSarvamModelAllowed(config.model);
    const model = sarvamModelOf(config, storedConfig);
    assertSarvamSpeakerAllowed(provider, config.speaker, model);
    assertSarvamTargetLanguageAllowed(provider, config.target_language_code, model);
    assertSarvamLimits(config, model);
  }
};

module.exports = {
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_VOICE_SETTINGS_BY_MODEL,
  SARVAM_TTS_MODELS,
  SARVAM_V3_SPEAKERS,
  SARVAM_V4_FLASH_SPEAKERS,
  SARVAM_V4_FLASH_SPEAKERS_BY_LANGUAGE,
  SARVAM_TTS_LANGUAGES,
  SARVAM_V4_FLASH_EXTRA_LANGUAGES,
  assertElevenLabsModelAllowed,
  assertElevenLabsVoiceSettings,
  assertSarvamSpeakerAllowed,
  assertSarvamTargetLanguageAllowed,
  assertSarvamLimits,
  assertTtsConfigAllowed,
};
