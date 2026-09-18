const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const meetingService = require('../../meeting/meeting.service');
const { httpError } = require('./common');

const router = express.Router();

/**
 * Join an assistant to a Google Meet call.
 * Puts an assistant into a video meeting as an ordinary participant.
 */
router.post('/join', asyncHandler(async (req, res) => {
  const { user_id, assistant_id, meeting_url, platform, bot_display_name, metadata } = req.body || {};

  // Validate required fields
  if (!user_id) {
    throw httpError(400, 'user_id is required');
  }

  if (!assistant_id) {
    throw httpError(400, 'assistant_id is required');
  }

  if (!meeting_url) {
    throw httpError(400, 'meeting_url is required');
  }

  const result = await meetingService.joinMeetingCall({
    user_id,
    assistant_id,
    meeting_url,
    platform,
    bot_display_name,
    metadata
  });

  res.status(200).json(result);
}));

module.exports = router;