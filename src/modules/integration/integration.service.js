const Integration = require('./integration.model');
const ResyncJob = require('./resync-job.model');
const User = require('../auth/user.model');
const assistantService = require('../assistant/assistant.service');

// A running job whose progress hasn't advanced in this long is treated as interrupted
// (e.g. the process restarted mid-run) so the caller knows to re-trigger.
const STALE_RESYNC_MS = 5 * 60 * 1000;

// Kick off the background re-sync for one (user, provider). Does NOT await the worker —
// returns as soon as the job doc is created so the HTTP request can respond immediately.
const startResync = async (user, serviceName) => {
  if (!user?.api_key) return { status: 'completed', total: 0 };

  const job = await ResyncJob.findOneAndUpdate(
    { user_id: user._id, service_name: serviceName },
    { $set: { status: 'running', total: 0, processed: 0, succeeded: 0, failed: [], error: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Fire-and-forget: the worker runs on the event loop after we return.
  assistantService.resyncAssistantsForIntegration({
    user,
    serviceName,
    onProgress: (p) => ResyncJob.updateOne({ _id: job._id }, { $set: p }),
  })
    .then((f) => ResyncJob.updateOne(
      { _id: job._id },
      { $set: { status: 'completed', total: f.total, processed: f.total, succeeded: f.succeeded, failed: f.failed } }
    ))
    .catch((e) => ResyncJob.updateOne({ _id: job._id }, { $set: { status: 'error', error: e.message } }));

  return { job_id: job._id, status: 'running' };
};

// Latest job for a (user, provider). A stale 'running' job is surfaced as 'interrupted'.
const getResyncStatus = async (userId, serviceName) => {
  const job = await ResyncJob.findOne({ user_id: userId, service_name: serviceName.toLowerCase() });
  if (!job) return null;
  const doc = job.toObject();
  if (doc.status === 'running' && Date.now() - new Date(doc.updatedAt).getTime() > STALE_RESYNC_MS) {
    doc.status = 'interrupted';
  }
  return doc;
};

// --- 1. Store API Key ---
const storeApiKey = async (data) => {
  const { user_id, service_type, service_name, api_key } = data;

  // Validate User
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');

  const normalizedServiceName = service_name.toLowerCase();
  const normalizedServiceType = service_type
    ? service_type.toUpperCase()
    : normalizedServiceName === 'gemini' ? 'LLM'
      : normalizedServiceName === 'sarvam_stt' ? 'STT'
      : 'TTS';

  // We use findOneAndUpdate with upsert: true. 
  // If a key for this user + service_name exists, it updates it. If not, it creates it.
  const integration = await Integration.findOneAndUpdate(
    {
      user_id: user._id,
      service_name: normalizedServiceName
    },
    {
      $set: {
        service_type: normalizedServiceType,
        api_key: api_key
      }
    },
    {
      new: true, // Return the updated document
      upsert: true, // Create if it doesn't exist
      setDefaultsOnInsert: true
    }
  );

  // Rotating this key must reach assistants that already baked in the old one.
  // Runs in the background — returns immediately with a job to poll.
  const resync = await startResync(user, normalizedServiceName);

  return { integration, resync };
};

// --- 2. Get API Key ---
const getApiKey = async (userId, serviceName) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const integration = await Integration.findOne({
    user_id: user._id,
    service_name: serviceName.toLowerCase()
  });

  if (!integration) {
    throw new Error(`API key for service '${serviceName}' not found for this user`);
  }

  return integration;
};

module.exports = {
  storeApiKey,
  getApiKey,
  startResync,
  getResyncStatus
};
