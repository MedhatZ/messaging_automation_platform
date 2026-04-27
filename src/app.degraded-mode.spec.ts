import { Test } from '@nestjs/testing';
describe('Degraded mode (Redis down)', () => {
  beforeEach(() => {
    // Simulate the outcome of checkRedisConnection() when Redis is unavailable.
    process.env.QUEUES_DISABLED = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/test?schema=public';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.QUEUES_DISABLED;
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
  });

  it('should compile AppModule without Bull/Redis', async () => {
    // Use require() to avoid needing --experimental-vm-modules in Jest.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('./app.module') as typeof import('./app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});

