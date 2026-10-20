const test = require('node:test');
const assert = require('node:assert');
const {
  ELEVENLABS_TTS_MODELS,
  SARVAM_V4_FLASH_SPEAKERS,
  SARVAM_V4_FLASH_SPEAKERS_BY_LANGUAGE,
  assertTtsConfigAllowed,
} = require('../../src/assistant/tts-rules');

const eleven = (config, stored) => () => assertTtsConfigAllowed('elevenlabs', config, stored);
const sarvam = (config, stored) => () => assertTtsConfigAllowed('sarvam', config, stored);

test('ElevenLabs accepts the v4 models and refuses an unknown one', () => {
  assert.ok(ELEVENLABS_TTS_MODELS.includes('eleven_v4') && ELEVENLABS_TTS_MODELS.includes('eleven_v4_turbo'));
  assert.doesNotThrow(eleven({ voice_id: 'v', model: 'eleven_v4' }));
  assert.throws(eleven({ voice_id: 'v', model: 'eleven_multilingual_v1' }), /does not have a TTS model called/);
});

test('ElevenLabs voice_settings are checked against what the model reads', () => {
  // eleven_v3 (the default) reads only stability.
  assert.doesNotThrow(eleven({ voice_settings: { stability: 0.5 } }));
  assert.throws(eleven({ voice_settings: { speed: 1.2 } }), /eleven_v3 does not read voice_settings speed.*eleven_multilingual_v2/);
  // v4 reads stability and similarity_boost, not speed (a live request showed it being ignored).
  assert.doesNotThrow(eleven({ model: 'eleven_v4', voice_settings: { stability: 0.4, similarity_boost: 0.8 } }));
  assert.throws(eleven({ model: 'eleven_v4_turbo', voice_settings: { speed: 1 } }), /does not read voice_settings speed/);
  assert.doesNotThrow(eleven({ model: 'eleven_flash_v2_5', voice_settings: { speed: 1.1, similarity_boost: 0.5 } }));
  assert.throws(eleven({ model: 'eleven_flash_v2_5', voice_settings: { style: 0.2 } }), /does not read voice_settings style/);
  assert.doesNotThrow(eleven({
    model: 'eleven_multilingual_v2',
    voice_settings: { stability: 1, similarity_boost: 1, style: 1, speed: 1, use_speaker_boost: true },
  }));
  // null means "unset", the same as omitting it.
  assert.doesNotThrow(eleven({ voice_settings: { stability: 0.5, speed: null } }));
  assert.throws(eleven({ voice_settings: { speaking_rate: 1 } }), /not an ElevenLabs voice setting/);
});

test('ElevenLabs judges a settings-only PATCH against the stored model', () => {
  assert.throws(
    eleven({ voice_settings: { speed: 1 } }, { model: 'eleven_v4' }),
    /eleven_v4 does not read voice_settings speed/
  );
  assert.doesNotThrow(eleven({ voice_settings: { speed: 1 } }, { model: 'eleven_turbo_v2_5' }));
});

test('the bulbul:v4-flash roster has the 224 upstream speakers, with no duplicates', () => {
  assert.strictEqual(SARVAM_V4_FLASH_SPEAKERS.length, 224);
  assert.strictEqual(new Set(SARVAM_V4_FLASH_SPEAKERS).size, 224);
  const counts = Object.fromEntries(Object.entries(SARVAM_V4_FLASH_SPEAKERS_BY_LANGUAGE).map(([k, v]) => [k, v.length]));
  assert.deepStrictEqual(counts, { as: 2, bn: 3, en: 62, enhi: 13, gu: 3, hi: 116, kn: 4, mr: 9, pa: 4, ta: 4, te: 4 });
});

test('Sarvam speakers come from the chosen model: no v3 name on v4-flash and the reverse', () => {
  assert.doesNotThrow(sarvam({ speaker: 'shubh' }));
  assert.doesNotThrow(sarvam({ model: 'bulbul:v4-flash', speaker: 'shubh_hi_customer' }));
  assert.throws(sarvam({ model: 'bulbul:v4-flash', speaker: 'shubh' }), /not available on bulbul:v4-flash/);
  // The v3 error names the v4-flash voices built on the same name.
  assert.throws(sarvam({ speaker: 'shubh_hi_customer' }), /not available on bulbul:v3/);
  assert.throws(sarvam({ speaker: 'anushka' }), /not available on bulbul:v3/);
});

test('Sarvam model and a speaker-only PATCH use the stored model', () => {
  assert.throws(sarvam({ model: 'bulbul:v9', speaker: 'shubh' }), /does not have a TTS model called 'bulbul:v9'/);
  assert.doesNotThrow(sarvam({ speaker: 'shubh_hi_customer' }, { model: 'bulbul:v4-flash' }));
  assert.throws(sarvam({ speaker: 'shubh' }, { model: 'bulbul:v4-flash' }), /not available on bulbul:v4-flash/);
});

test('Sarvam IN22 language codes are bulbul:v4-flash only', () => {
  assert.throws(sarvam({ target_language_code: 'as-IN' }), /not spoken by bulbul:v3 \(only bulbul:v4-flash speaks it\)/);
  assert.doesNotThrow(sarvam({ model: 'bulbul:v4-flash', speaker: 'kangkana_as_conversational', target_language_code: 'as-IN' }));
  assert.throws(sarvam({ model: 'bulbul:v4-flash', target_language_code: 'en-US' }), /Note 'en-IN', not 'en-US'/);
});

test('Sarvam pace, sample rate and temperature differ per generation', () => {
  assert.doesNotThrow(sarvam({ pace: 0.3, speech_sample_rate: 48000, temperature: 0.01 }));
  assert.throws(sarvam({ pace: 3.5 }), /pace must be between 0.3 and 3 on bulbul:v3/);
  const flash = { model: 'bulbul:v4-flash', speaker: 'shubh_hi_customer' };
  assert.doesNotThrow(sarvam({ ...flash, pace: 2, speech_sample_rate: 24000 }));
  assert.throws(sarvam({ ...flash, pace: 0.4 }), /pace must be between 0.5 and 2 on bulbul:v4-flash/);
  assert.throws(sarvam({ ...flash, speech_sample_rate: 44100 }), /speech_sample_rate on bulbul:v4-flash must be one of: 8000, 16000, 22050, 24000/);
  assert.throws(sarvam({ ...flash, temperature: 0.3 }), /temperature is not accepted on bulbul:v4-flash/);
  assert.throws(sarvam({ temperature: 3 }), /temperature must be between 0.01 and 2 on bulbul:v3/);
});

test('other providers and a missing config are not this module\'s business', () => {
  assert.doesNotThrow(() => assertTtsConfigAllowed('cartesia', { voice_id: 'x', speed: 9 }));
  assert.doesNotThrow(() => assertTtsConfigAllowed('sarvam', undefined));
});
