const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

/**
 * Join an assistant to a Google Meet call.
 * 
 * @param {Object} data - Meeting call data
 * @param {string} data.user_id - User ID
 * @param {string} data.assistant_id - Assistant ID (local or external)
 * @param {string} data.meeting_url - Google Meet URL
 * @param {string} [data.platform='google_meet'] - Meeting platform
 * @param {string} [data.bot_display_name] - Display name for the bot in the meeting
 * @param {Object} [data.metadata] - Metadata to inject into assistant placeholders
 * @returns {Promise<Object>} API response with meeting call details
 */
const joinMeetingCall = async (data) => {
  const { user_id, assistant_id, meeting_url, platform = 'google_meet', bot_display_name, metadata } = data;

  // 1. Validate User & API Key
  const user = await getUserWithKey(user_id);

  // 2. Validate required fields
  if (!assistant_id) {
    const error = new Error('assistant_id is required');
    error.status = 400;
    throw error;
  }

  if (!meeting_url) {
    const error = new Error('meeting_url is required');
    error.status = 400;
    throw error;
  }

  // 3. Validate Google Meet URL format
  const googleMeetUrlRegex = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  if (platform === 'google_meet' && !googleMeetUrlRegex.test(meeting_url)) {
    const error = new Error('Invalid Google Meet URL format. Expected format: https://meet.google.com/xxx-xxxx-xxx');
    error.status = 400;
    throw error;
  }

  // 4. Resolve Assistant ID
  const assistant = await findByLocalOrExternalId(Assistant, assistant_id, user._id, 'external_assistant_id');
  if (!assistant) {
    const error = new Error('Assistant not found for this user');
    error.status = 404;
    throw error;
  }

  // 5. Construct External Payload
  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    meeting_url: meeting_url,
    platform: platform
  };

  // 6. Add optional fields
  if (bot_display_name) {
    externalPayload.bot_display_name = bot_display_name;
  }
  
  if (metadata) {
    externalPayload.metadata = metadata;
  }

  // 7. Hit the External API
  return callExternal(user.api_key, {
    method: 'post',
    path: '/meeting_call/join',
    data: externalPayload,
    fallback: 'External API Error while joining meeting call',
    networkFallback: 'Failed to contact external meeting call service',
  });
};

module.exports = {
  joinMeetingCall
};