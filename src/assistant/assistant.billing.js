/**
 * Call-log listing and billable-minute aggregation for assistants.
 * Both aggregators page through the same upstream call-logs endpoint.
 */
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');
const { getLogger } = require('../core/logging/logger');

const logger = getLogger('assistant.billing');

// Maximum page size the upstream accepts — fewer round trips per aggregation.
const LOG_PAGE_LIMIT = 100;

// One external call-logs fetch. Shared by the raw log listing and both billable-minutes
// aggregators.
const fetchCallLogs = (apiKey, externalAssistantId, params) =>
  callExternal(apiKey, {
    path: `/assistant/call-logs/${externalAssistantId}`,
    params,
    fallback: 'Failed to fetch call logs',
  });

// Page params for one call-logs request, carrying the caller's date window through.
const logPageParams = (page, queryParams) => {
  const apiParams = { page, limit: LOG_PAGE_LIMIT };
  if (queryParams.start_date) apiParams.start_date = queryParams.start_date;
  if (queryParams.end_date) apiParams.end_date = queryParams.end_date;
  return apiParams;
};

const timespanEvaluated = (queryParams) => ({
  start_date: queryParams.start_date || 'lifetime',
  end_date: queryParams.end_date || 'lifetime',
});

/**
 * Walk every page of one assistant's call logs, handing each page's logs to `onLogs`.
 * Stops on the last page, on an empty page, or when `onError` is given and a fetch fails.
 */
const eachLogPage = async (apiKey, externalAssistantId, queryParams, onLogs, onError) => {
  let currentPage = 1;
  let totalPages = 1;

  do {
    let response;
    try {
      response = await fetchCallLogs(apiKey, externalAssistantId, logPageParams(currentPage, queryParams));
    } catch (error) {
      if (!onError) throw error;
      onError(error);
      return;
    }

    const callLogsData = response?.data;
    if (!callLogsData || !callLogsData.logs) return;

    onLogs(callLogsData.logs);
    totalPages = callLogsData.pagination?.total_pages || 1;
    currentPage++;
  } while (currentPage <= totalPages);
};

// Resolve one of the user's assistants by local _id or external id.
const resolveAssistant = async (userId, assistantId) => {
  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
  if (!assistant) throw new Error('Assistant not found');
  return assistant;
};

/** Raw upstream call logs for one assistant, forwarded unchanged. */
const getCallLogs = async (userId, assistantId, queryParams) => {
  const user = await getUserWithKey(userId);
  const assistant = await resolveAssistant(userId, assistantId);

  return fetchCallLogs(user.api_key, assistant.external_assistant_id, queryParams);
};

/** Billable minutes for one assistant, restricted to a single `to_number`. */
const getTotalBillableDuration = async (userId, assistantId, queryParams) => {
  const user = await getUserWithKey(userId);
  const assistant = await resolveAssistant(userId, assistantId);

  const targetNumber = queryParams.to_number;
  if (!targetNumber) throw new Error('to_number is required to calculate billable minutes');

  let totalBillableMinutes = 0;

  await eachLogPage(user.api_key, assistant.external_assistant_id, queryParams, (logs) => {
    for (const log of logs) {
      if (log.to_number !== targetNumber) continue;
      totalBillableMinutes += log.billable_duration_minutes || 0;
    }
  });

  return {
    success: true,
    message: 'Total billable minutes calculated successfully',
    data: {
      assistant_id: assistant.external_assistant_id,
      to_number: targetNumber,
      // Same name as the platform-wise endpoint — one quantity, one key.
      total_billable_minutes: totalBillableMinutes,
      timespan_evaluated: timespanEvaluated(queryParams),
    },
  };
};

/**
 * Billable minutes for every assistant the user owns, grouped by platform number.
 * A per-assistant fetch failure is logged and skipped so one bad assistant does not
 * fail the whole report.
 */
const getPlatformWiseBillableMinutes = async (userId, queryParams) => {
  const user = await getUserWithKey(userId);

  const assistants = await Assistant.find({ user_id: user._id });
  if (!assistants || assistants.length === 0) {
    return {
      success: true,
      message: 'No assistants found for this user',
      data: { platform_wise_minutes: [] },
    };
  }

  const platformBillableMap = {};

  for (const assistant of assistants) {
    await eachLogPage(
      user.api_key,
      assistant.external_assistant_id,
      queryParams,
      (logs) => {
        for (const log of logs) {
          const pNumber = log.platform_number || 'Unknown Platform';
          platformBillableMap[pNumber] = (platformBillableMap[pNumber] || 0) + (log.billable_duration_minutes || 0);
        }
      },
      // callExternal already flattens the upstream message onto the Error.
      (error) => logger.error(
        `failed to fetch logs for assistant ${assistant.external_assistant_id}: ${error.message}`
      )
    );
  }

  const aggregatedData = Object.keys(platformBillableMap).map((platform_number) => ({
    platform_number,
    total_billable_minutes: platformBillableMap[platform_number],
  }));

  return {
    success: true,
    message: 'Platform-wise billable minutes calculated successfully',
    data: {
      platform_wise_minutes: aggregatedData,
      timespan_evaluated: timespanEvaluated(queryParams),
    },
  };
};

module.exports = {
  fetchCallLogs,
  getCallLogs,
  getTotalBillableDuration,
  getPlatformWiseBillableMinutes,
};
