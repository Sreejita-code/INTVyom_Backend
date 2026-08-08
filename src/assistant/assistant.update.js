/**
 * Assistant update flow: resolve the target mode, build the upstream patch payload,
 * push it, then mirror the accepted fields into the local record.
 * Payload rules live in assistant.rules.js, config construction in assistant.builder.js.
 */
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const {
  badRequest,
  rejectRetiredModeAlias,
  requestedModeFrom,
  pickAssistantFields,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  assertLlmModelAllowedInMode,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
} = require('./assistant.rules');
const {
  buildPipelineTtsConfig,
  buildPipelineSttConfig,
  resolveProvider,
  buildLlmConfig,
} = require('./assistant.builder');

// Local field name per incoming payload key. Explicit `undefined` checks below keep
// boolean false and empty strings from being dropped.
const LOCAL_FIELD_BY_PAYLOAD_KEY = {
  assistant_name: 'name',
  assistant_description: 'description',
  assistant_prompt: 'prompt',
  assistant_llm_config: 'llm_config',
  assistant_tts_model: 'tts_model',
  assistant_tts_config: 'tts_config',
  assistant_stt_model: 'stt_model',
  assistant_stt_config: 'stt_config',
  assistant_start_instruction: 'start_instruction',
  assistant_end_call_enabled: 'end_call_enabled',
  assistant_end_call_trigger_phrase: 'end_call_trigger_phrase',
  assistant_end_call_agent_message: 'end_call_agent_message',
  assistant_end_call_url: 'end_call_url',
  assistant_greeting_audio: 'greeting_audio',
};

// Realtime carries no speech pipeline — drop both halves of TTS and STT.
const stripPipelineFields = (payload) => {
  delete payload.assistant_tts_model;
  delete payload.assistant_tts_config;
  delete payload.assistant_stt_model;
  delete payload.assistant_stt_config;
};

/**
 * TTS must go out as a pair — the external API rejects assistant_tts_config without
 * assistant_tts_model (there is no discriminator to validate the config against).
 */
const applyTtsPair = async (payload, updateData, existingAssistant, userId) => {
  const { model: ttsModel, config: ttsConfig } = resolvePairForUpdate(updateData, existingAssistant, 'tts');

  if (ttsModel === undefined) {
    // Never configured and the caller sent none: send neither half.
    delete payload.assistant_tts_model;
    delete payload.assistant_tts_config;
    return;
  }

  payload.assistant_tts_model = ttsModel;
  // `?? {}` keeps the pair intact; every real TTS model resolves a key, so this only
  // fires for an unknown model, which the external API then rejects with its own message.
  payload.assistant_tts_config = await buildPipelineTtsConfig({ userId, ttsModel, ttsConfig }) ?? {};
};

/**
 * STT is looser: the model alone is legal (it resets that provider's defaults), but a
 * lone config is rejected. `native` resolves no config, so it goes out as model-only.
 */
const applySttPair = async (payload, updateData, existingAssistant, userId, targetMode) => {
  const { model: sttModel, config: sttConfig } = resolvePairForUpdate(updateData, existingAssistant, 'stt');
  assertSttModelAllowedInMode(targetMode, sttModel);

  if (sttModel === undefined) {
    delete payload.assistant_stt_model;
    delete payload.assistant_stt_config;
    return;
  }

  payload.assistant_stt_model = sttModel;

  const finalSttConfig = await buildPipelineSttConfig({ userId, sttModel, sttConfig });
  if (finalSttConfig !== undefined) payload.assistant_stt_config = finalSttConfig;
  else delete payload.assistant_stt_config;
};

// Fields the local record mirrors after the upstream patch is accepted.
const buildLocalUpdateFields = (updateData, { targetMode, provider, modeChanged, providerChanged }) => {
  const fields = {};

  for (const [payloadKey, localField] of Object.entries(LOCAL_FIELD_BY_PAYLOAD_KEY)) {
    if (updateData[payloadKey] !== undefined) fields[localField] = updateData[payloadKey];
  }

  if (updateData.assistant_interaction_config !== undefined) {
    fields.interaction_config = sanitizeInteractionConfigForMode(
      updateData.assistant_interaction_config,
      targetMode
    );
  }
  if (modeChanged) fields.llm_mode = targetMode;
  if (providerChanged) fields.llm_provider = provider;

  return fields;
};

/**
 * Update one assistant upstream and locally.
 * @param {string} assistantId external assistant id
 * @returns {Promise<object>} `{ success, message, data, local_data }`
 */
const updateAssistant = async (userId, assistantId, updateData) => {
  const user = await getUserWithKey(userId);
  rejectRetiredModeAlias(updateData);

  const modeRequestedExplicitly = requestedModeFrom(updateData) !== undefined;
  const llmConfigProvided = updateData.assistant_llm_config !== undefined;

  const existingAssistant = await Assistant.findOne({ external_assistant_id: assistantId });

  const { targetMode, modeDerivedFromPayload } = inferTargetModeForUpdate(
    updateData,
    existingAssistant?.llm_mode
  );
  const shouldIncludeModeInExternal = modeRequestedExplicitly || modeDerivedFromPayload;
  const provider = resolveProvider({
    llmConfig: updateData.assistant_llm_config,
    existing: existingAssistant,
    mode: targetMode,
    modeExplicit: modeRequestedExplicitly,
  });
  // Only push LLM config when requested, except realtime mode switches where the config object
  // is mandatory.
  const touchesLlm = llmConfigProvided || (modeRequestedExplicitly && targetMode === 'realtime');

  // A mode switch is checked against the STORED provider too, not just the request. Naming a
  // mode alone resets the local provider to that mode's default, but upstream still holds
  // `gemini` — and it answers 400 for that pairing. Ask for the fix in the same PATCH instead
  // of letting the request half-apply.
  // Keyed on shouldIncludeModeInExternal, not on an explicit assistant_mode: a TTS/STT edit
  // also sends a mode upstream (inferred), and that inferred mode hits the same wall.
  const storedProvider = existingAssistant?.llm_provider ?? existingAssistant?.llm_config?.provider;
  if (shouldIncludeModeInExternal && targetMode !== 'realtime' && !llmConfigProvided && storedProvider === 'gemini') {
    throw badRequest(
      `assistant_mode '${targetMode}' cannot run on the stored LLM provider 'gemini' — ` +
      "send assistant_llm_config with provider 'openai' (and a matching model) in the same request"
    );
  }

  // Same merged-state check as STT: naming a new mode over a stored model from the other
  // family (a realtime ID on a row moving to cascade) is unrunnable, so catch it here rather
  // than after the assistant has already been half-migrated upstream.
  if (llmConfigProvided || modeRequestedExplicitly) {
    assertLlmModelAllowedInMode(
      targetMode,
      provider,
      updateData.assistant_llm_config?.model ?? existingAssistant?.llm_config?.model
    );
  }

  // Whitelist, not a spread: only fields the external API knows about go out.
  const externalUpdatePayload = pickAssistantFields(updateData);

  if (updateData.assistant_interaction_config !== undefined) {
    externalUpdatePayload.assistant_interaction_config = sanitizeInteractionConfigForMode(
      updateData.assistant_interaction_config,
      targetMode
    );
  }

  if (modeRequestedExplicitly && targetMode === 'realtime' && !llmConfigProvided) {
    throw badRequest("assistant_llm_config is required when switching assistant_mode to 'realtime'");
  }

  // LLM config is forwarded only on explicit LLM edits, plus realtime mode switches.
  if (touchesLlm) {
    externalUpdatePayload.assistant_llm_config = await buildLlmConfig({
      userId: user._id,
      llmConfig: llmConfigProvided ? updateData.assistant_llm_config : existingAssistant?.llm_config,
      provider,
      keyRequired: false,
    });
  } else {
    delete externalUpdatePayload.assistant_llm_config;
  }

  if (shouldIncludeModeInExternal) externalUpdatePayload.assistant_mode = targetMode;
  else delete externalUpdatePayload.assistant_mode;

  if (targetMode === 'realtime') {
    stripPipelineFields(externalUpdatePayload);
  } else {
    // Re-check the STT selection against the merged result, not just the request: switching an
    // assistant into cascade while it still holds `native` is unrunnable even though neither
    // half of the request is wrong on its own.
    if (targetMode === 'cascade') {
      assertSttModelAllowedInMode(
        targetMode,
        updateData.assistant_stt_model ?? existingAssistant?.stt_model
      );
    }

    const ttsTouched =
      updateData.assistant_tts_model !== undefined ||
      updateData.assistant_tts_config !== undefined ||
      modeDerivedFromPayload;
    if (ttsTouched) await applyTtsPair(externalUpdatePayload, updateData, existingAssistant, user._id);

    const sttTouched =
      updateData.assistant_stt_model !== undefined ||
      updateData.assistant_stt_config !== undefined ||
      modeDerivedFromPayload;
    if (sttTouched) await applySttPair(externalUpdatePayload, updateData, existingAssistant, user._id, targetMode);
  }

  await callExternal(user.api_key, {
    method: 'patch',
    path: `/assistant/update/${assistantId}`,
    data: externalUpdatePayload,
    fallback: 'Failed to update assistant externally',
  });

  const localUpdateFields = buildLocalUpdateFields(updateData, {
    targetMode,
    provider,
    modeChanged: shouldIncludeModeInExternal,
    providerChanged: llmConfigProvided || shouldIncludeModeInExternal,
  });

  const updatedAssistant = await Assistant.findOneAndUpdate(
    { external_assistant_id: assistantId },
    { $set: localUpdateFields },
    { new: true }
  );

  return {
    success: true,
    message: 'Assistant updated successfully',
    data: { assistant_id: assistantId },
    local_data: updatedAssistant,
  };
};

module.exports = { updateAssistant };
