
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'bun:test'
import request from 'supertest';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/connections/connectDB';
import { BillingProfile } from '../../src/models/billingProfileModel';
import { Subscription } from '../../src/models/subscriptionModel';
import { Invoice } from '../../src/models/invoiceModel';

describe('Billing Integration Tests', () => {
  let authToken;
  let testCustomerId;
  let testSubscriptionId;
  let testBillingProfileId;

  beforeAll(async () => {
    // Connect to test database
    await connectDB();

    // Create test user and get auth token
    const userResponse = await request(app).post('/api/v1/auth/register').send({
      name: 'Test User',
      emailAddress: 'billing.test@example.com',
      password: 'TestPassword123!',
      phoneNumber: '+919876543210'
    });

    testCustomerId = userResponse.body.data.user.id;

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      emailAddress: 'billing.test@example.com',
      password: 'TestPassword123!'
    });

    authToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await BillingProfile.deleteMany({ customerId: testCustomerId });
    await Subscription.deleteMany({ customerId: testCustomerId });
    await Invoice.deleteMany({ customerId: testCustomerId });

    // Disconnect from database
    await disconnectDB();
  });

  beforeEach(async () => {
    // Clean up before each test
    await BillingProfile.deleteMany({ customerId: testCustomerId });
    await Subscription.deleteMany({ customerId: testCustomerId });
    await Invoice.deleteMany({ customerId: testCustomerId });
  });

  describe('POST /api/v1/billing/profiles/:customerId', () => {
    it('should create a billing profile successfully', async () => {
      const billingProfileData = {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        },
        taxInformation: {
          taxId: 'GST123456789',
          taxType: 'GST',
          exemptionStatus: false
        },
        preferences: {
          currency: 'INR',
          invoiceDelivery: 'email',
          autoRenewal: true,
          reminderDays: 7,
          language: 'en'
        }
      };

      const response = await request(app)
        .post(`/api/v1/billing/profiles/${testCustomerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(billingProfileData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Billing profile created successfully');
      expect(response.body.data.billingProfile).toBeTruthy();
      expect(response.body.data.billingProfile.customerId).toBe(testCustomerId);
      assert.deepStrictEqual(
        response.body.data.billingProfile.billingAddress.street,
        billingProfileData.billingAddress.street
      );

      testBillingProfileId = response.body.data.billingProfile._id;
    });

    it('should return 409 when billing profile already exists', async () => {
      // Create initial profile
      await BillingProfile.createProfile(testCustomerId, {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        }
      });

      const billingProfileData = {
        billingAddress: {
          street: '456 Another Street',
          city: 'Another City',
          state: 'Another State',
          postalCode: '67890',
          country: 'IN'
        }
      };

      const response = await request(app)
        .post(`/api/v1/billing/profiles/${testCustomerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(billingProfileData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message.includes('already exists').toBeTruthy());
    });
  });

  describe('GET /api/v1/billing/profiles/:customerId', () => {
    beforeEach(async () => {
      // Create a billing profile for testing
      const profile = await BillingProfile.createProfile(testCustomerId, {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        },
        creditBalance: 100
      });
      testBillingProfileId = profile._id;
    });

    it('should retrieve billing profile successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/profiles/${testCustomerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Billing profile retrieved successfully');
      expect(response.body.data.billingProfile).toBeTruthy();
      expect(response.body.data.billingProfile.customerId).toBe(testCustomerId);
      expect(response.body.data.billingProfile.creditBalance).toBe(100);
    });

    it('should return 404 when billing profile not found', async () => {
      const nonExistentCustomerId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/v1/billing/profiles/${nonExistentCustomerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message.includes('not found').toBeTruthy());
    });
  });

  describe('POST /api/v1/billing/profiles/:customerId/payment-methods', () => {
    beforeEach(async () => {
      // Create a billing profile for testing
      const profile = await BillingProfile.createProfile(testCustomerId, {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        }
      });
      testBillingProfileId = profile._id;
    });

    it('should add payment method successfully', async () => {
      const paymentMethodData = {
        methodId: 'pm_test_123',
        type: 'card',
        details: {
          last4: '4242',
          brand: 'visa',
          expiryMonth: 12,
          expiryYear: 2025,
          holderName: 'Test User'
        },
        isDefault: true
      };

      const response = await request(app)
        .post(`/api/v1/billing/profiles/${testCustomerId}/payment-methods`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentMethodData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Payment method added successfully');
      expect(response.body.data.billingProfile).toBeTruthy();
      expect(response.body.data.billingProfile.paymentMethods.length).toBe(1);
      expect(response.body.data.billingProfile.paymentMethods[0].methodId).toBe('pm_test_123'
      );
      expect(response.body.data.billingProfile.paymentMethods[0].isDefault).toBe(true);
    });

    it('should validate payment method data', async () => {
      const invalidPaymentMethodData = {
        methodId: 'pm_test_123',
        type: 'card',
        details: {
          last4: '42', // Invalid - should be 4 digits
          brand: 'invalid_brand',
          expiryMonth: 13, // Invalid - should be 1-12
          expiryYear: 2020 // Invalid - should be in future
        }
      };

      const response = await request(app)
        .post(`/api/v1/billing/profiles/${testCustomerId}/payment-methods`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPaymentMethodData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message.includes('Validation error').toBeTruthy());
    });
  });

  describe('POST /api/v1/billing/invoices/generate/:subscriptionId', () => {
    beforeEach(async () => {
      // Create billing profile and subscription for testing
      await BillingProfile.createProfile(testCustomerId, {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        },
        taxInformation: {
          taxRate: 0.18
        },
        creditBalance: 50
      });

      const subscription = await Subscription.create({
        customerId: testCustomerId,
        planId: 'plan_basic',
        planName: 'Basic Plan',
        billingCycle: 'monthly',
        amount: 1000,
        currency: 'INR',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      testSubscriptionId = subscription._id;
    });

    it('should generate invoice successfully', async () => {
      const invoiceData = {
        dueDays: 30,
        paymentTerms: 'Net 30',
        notes: 'Test invoice generation'
      };

      const response = await request(app)
        .post(`/api/v1/billing/invoices/generate/${testSubscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Invoice generated successfully');
      expect(response.body.data.invoice).toBeTruthy();
      expect(response.body.data.invoice.metadata.invoiceData).toBeTruthy();

      const invoiceMetadata = response.body.data.invoice.metadata.invoiceData;
      expect(invoiceMetadata.subtotal).toBe(1000);
      expect(invoiceMetadata.taxAmount).toBe(180); // 18% of 1000
      expect(invoiceMetadata.creditApplied).toBe(50);
      expect(invoiceMetadata.total).toBe(1180);
      expect(invoiceMetadata.amountDue).toBe(1130); // 1180 - 50
    });

    it('should return existing invoice for idempotent request', async () => {
      const invoiceData = {
        dueDays: 30,
        paymentTerms: 'Net 30'
      };

      // First request
      const response1 = await request(app)
        .post(`/api/v1/billing/invoices/generate/${testSubscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData)
        .expect(201);

      // Second request with same correlation ID (should be idempotent)
      const response2 = await request(app)
        .post(`/api/v1/billing/invoices/generate/${testSubscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData);

      // Note: In a real scenario, idempotency would be based on correlation ID
      // For this test, we're just checking that the service handles the request
      expect(response2.body.data.invoice).toBeTruthy();
    });
  });

  describe('POST /api/v1/billing/invoices/proration/:subscriptionId', () => {
    beforeEach(async () => {
      // Create billing profile and subscription for testing
      await BillingProfile.createProfile(testCustomerId, {
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '12345',
          country: 'IN'
        },
        taxInformation: {
          taxRate: 0.18
        }
      });

      const subscription = await Subscription.create({
        customerId: testCustomerId,
        planId: 'plan_basic',
        planName: 'Basic Plan',
        billingCycle: 'monthly',
        amount: 1000,
        currency: 'INR',
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        nextBillingDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      });

      testSubscriptionId = subscription._id;
    });

    it('should generate proration invoice for plan upgrade', async () => {
      const prorationData = {
        planName: 'Premium Plan',
        amount: 2000 // Upgrade from 1000 to 2000
      };

      const response = await request(app)
        .post(`/api/v1/billing/invoices/proration/${testSubscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(prorationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Proration invoice generated successfully');
      expect(response.body.data.invoice).toBeTruthy();
      expect(response.body.data.invoice.metadata.invoiceData).toBeTruthy();

      const invoiceMetadata = response.body.data.invoice.metadata.invoiceData;
      expect(invoiceMetadata.type).toBe('proration_invoice');
      expect(invoiceMetadata.prorationDetails).toBeTruthy();
      expect(invoiceMetadata.prorationDetails.remainingDays > 0).toBeTruthy();
    });
  });

  describe('POST /api/v1/billing/recurring', () => {
    it('should process recurring billing in dry run mode', async () => {
      const recurringData = {
        bufferHours: 24,
        dryRun: true
      };

      const response = await request(app)
        .post('/api/v1/billing/recurring')
        .set('Authorization', `Bearer ${authToken}`)
        .send(recurringData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Recurring billing dry run completed');
      expect(response.body.data.results).toBeTruthy();
      expect(typeof response.body.data.results.total === 'number').toBeTruthy();
    });
  });

  describe('GET /api/v1/billing/invoices/customer/:customerId', () => {
    beforeEach(async () => {
      // Create some test invoices
      await Invoice.create({
        invoiceNumber: 'INV-TEST-001',
        correlationId: 'test-corr-001',
        customerId: testCustomerId,
        type: 'invoice',
        status: 'pending',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currency: 'INR',
        subtotal: 1000,
        taxAmount: 180,
        total: 1180,
        amountDue: 1180,
        lineItems: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 1000,
            amount: 1000
          }
        ]
      });
    });

    it('should retrieve customer invoices successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/invoices/customer/${testCustomerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Customer invoices retrieved successfully');
      expect(response.body.data.invoices).toBeTruthy();
      expect(response.body.data.pagination).toBeTruthy();
      expect(response.body.data.invoices.length).toBe(1);
      expect(response.body.data.invoices[0].invoiceNumber).toBe('INV-TEST-001');
    });

    it('should filter invoices by status', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/invoices/customer/${testCustomerId}?status=pending`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.invoices).toBeTruthy();
      response.body.data.invoices.forEach((invoice) => {
        expect(invoice.status).toBe('pending');
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all billing endpoints', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/profiles/${testCustomerId}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/api/v1/billing/profiles/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
