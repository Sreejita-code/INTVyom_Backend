const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

// Mock the meeting service
const mockMeetingService = {
  joinMeetingCall: async (data) => {
    if (data.assistant_id === 'invalid-assistant') {
      const error = new Error('Assistant not found for this user');
      error.status = 404;
      throw error;
    }
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
};

// Create test app with mocked service
const app = express();
app.use(express.json());

// Mock the common module
const mockCommon = {
  httpError: (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
  }
};

// Load middleware
const asyncHandler = require('../../../src/core/middleware/asyncHandler');
const errorHandler = require('../../../src/core/middleware/errorHandler');

// Load routes with mocked dependencies
const meetingRoutes = proxyquire('../../../src/api/routes/meeting.routes', {
  '../../meeting/meeting.service': mockMeetingService,
  './common': mockCommon,
  '../../core/middleware/asyncHandler': asyncHandler
});

app.use('/api/meeting-call', meetingRoutes);
app.use(errorHandler);

// Test the routes
test('POST /api/meeting-call/join validates required fields', async (t) => {
  await t.test('should return 400 when user_id is missing', async () => {
    const response = await request(app)
      .post('/api/meeting-call/join')
      .send({
        assistant_id: 'assistant1',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      })
      .expect(400);
    
    assert.strictEqual(response.body.error, 'user_id is required');
  });

  await t.test('should return 400 when assistant_id is missing', async () => {
    const response = await request(app)
      .post('/api/meeting-call/join')
      .send({
        user_id: 'user1',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      })
      .expect(400);
    
    assert.strictEqual(response.body.error, 'assistant_id is required');
  });

  await t.test('should return 400 when meeting_url is missing', async () => {
    const response = await request(app)
      .post('/api/meeting-call/join')
      .send({
        user_id: 'user1',
        assistant_id: 'assistant1'
      })
      .expect(400);
    
    assert.strictEqual(response.body.error, 'meeting_url is required');
  });
});

test('POST /api/meeting-call/join handles successful request', async (t) => {
  await t.test('should return 200 with meeting call details', async () => {
    const response = await request(app)
      .post('/api/meeting-call/join')
      .send({
        user_id: 'user1',
        assistant_id: 'assistant1',
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        platform: 'google_meet',
        bot_display_name: 'Test Bot',
        metadata: { key: 'value' }
      })
      .expect(200);
    
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.room_name, 'test-room-123');
  });
});

test('POST /api/meeting-call/join handles service errors', async (t) => {
  await t.test('should return 404 when assistant is not found', async () => {
    const response = await request(app)
      .post('/api/meeting-call/join')
      .send({
        user_id: 'user1',
        assistant_id: 'invalid-assistant',
        meeting_url: 'https://meet.google.com/abc-defg-hij'
      })
      .expect(404);
    
    assert.strictEqual(response.body.error, 'Assistant not found for this user');
  });
});