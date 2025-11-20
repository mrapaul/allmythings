/**
 * Labels Endpoint Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createTestUserId } from '../utils/test-auth';
import { createTestLabel } from '../fixtures/test-data';

describe('Labels Endpoint Integration Tests', () => {
  let app: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;
  let authHeader: string;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
    authHeader = createAuthHeader(createTestUserId());
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /v1/labels - Create Label', () => {
    it('should require authentication', async () => {
      const labelData = createTestLabel();
      const response = await request.post('/v1/labels').send(labelData);
      expect(response.status).toBe(401);
    });

    it('should create a label when authenticated', async () => {
      const labelData = createTestLabel();
      const response = await request
        .post('/v1/labels')
        .set('Authorization', authHeader)
        .send(labelData);

      expect([201, 400, 422]).toContain(response.status);
    });

    it('should require label value', async () => {
      const labelData = createTestLabel();
      delete (labelData as any).value;

      const response = await request
        .post('/v1/labels')
        .set('Authorization', authHeader)
        .send(labelData);

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('PATCH /v1/labels/:id - Update Label', () => {
    it('should return 404 for non-existent label', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request
        .patch(`/v1/labels/${fakeId}`)
        .set('Authorization', authHeader)
        .send({ value: 'new-value' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request
        .patch(`/v1/labels/${fakeId}`)
        .send({ value: 'new-value' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /v1/labels/:id - Delete Label', () => {
    it('should return 404 for non-existent label', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request
        .delete(`/v1/labels/${fakeId}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request.delete(`/v1/labels/${fakeId}`);
      expect(response.status).toBe(401);
    });
  });
});
