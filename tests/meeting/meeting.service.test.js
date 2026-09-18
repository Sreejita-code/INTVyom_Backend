const test = require('node:test');
const assert = require('node:assert');
const proxyquire = require('proxyquire').noCallThru();

// Mock dependencies
const mockUserAccess = async (userId) => {
  if (userId === 'invalid-user') {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  return { _id: 'user1', api_key: 'test-api-key' };
};

const mockFindByLocalOrExternalId = (Model, id, userId, externalField) => {
  if (id === 'invalid-assistant') {
    return null;
  }
  return { external_assistant_id: 'ext-assistant-123' };
};

const mockCallExternal = async (apiKey, opts) => {
  if (opts.path === '/meeting_call/join') {
    return {
      success: true,
      message: 'Meeting call started successfully',
      data: {
        room_name: 'test-room-123',
        platform: 'google_meet',
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        agent_dispatch: { id: 'agent-dispatch-123' },
        connector_dispatch: { id: 'connector-dispatch-123' }
      }
    };
  }
  throw new Error('Unexpected API call');
};

// Load module with mocked dependencies
const { joinMeetingCall } = proxyquire('../../src/meeting/meeting.service', {
  '../auth/userAccess': mockUserAccess,
  '../core/db/functions/findByLocalOrExternalId': mockFindByLocalOrExternalId,
  '../services/livekit/livekitService': { callExternal: mockCallExternal }
});

test('joinMeetingCall validates required fields', async (t) => {
  await t.test('should throw error when assistant_id is missing', async () => {
    try {
      await joinMeetingCall({
        user_id: 'user1',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'assistant_id is required');
      assert.strictEqual(error.status, 400);
    }
  });

  await t.test('should throw error when meeting_url is missing', async () => {
    try {
      await joinMeetingCall({
        user_id: 'user1',
        assistant_id: 'assistant1'
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'meeting_url is required');
      assert.strictEqual(error.status, 400);
    }
  });
});

test('joinMeetingCall validates Google Meet URL format', async (t) => {
  await t.test('should throw error for invalid Google Meet URL', async () => {
    try {
      await joinMeetingCall({
        user_id: 'user1',
        assistant_id: 'assistant1',
        meeting_url: 'https://invalid-url.com/meeting',
        platform: 'google_meet'
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'Invalid Google Meet URL format. Expected format: https://meet.google.com/xxx-xxxx-xxx');
      assert.strictEqual(error.status, 400);
    }
  });

  await t.test('should accept valid Google Meet URL', async () => {
    const result = await joinMeetingCall({
      user_id: 'user1',
      assistant_id: 'assistant1',
      meeting_url: 'https://meet.google.com/abc-defg-hij',
      platform: 'google_meet'
    });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.room_name, 'test-room-123');
  });
});

test('joinMeetingCall handles user authentication', async (t) => {
  await t.test('should throw error for invalid user', async () => {
    try {
      await joinMeetingCall({
        user_id: 'invalid-user',
        assistant_id: 'assistant1',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'User not found');
      assert.strictEqual(error.status, 404);
    }
  });
});

test('joinMeetingCall handles assistant resolution', async (t) => {
  await t.test('should throw error for invalid assistant', async () => {
    try {
      await joinMeetingCall({
        user_id: 'user1',
        assistant_id: 'invalid-assistant',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      });
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'Assistant not found for this user');
      assert.strictEqual(error.status, 404);
    }
  });
});