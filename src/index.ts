import { Logger } from './utils/logger';

const logger = new Logger();

addEventListener('fetch', (event) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  logger.info({ requestId, method: event.request.method });

  event.respondWith(handleRequest(event.request, requestId, start));
});

async function handleRequest(request: Request, requestId: string, start: number): Promise<Response> {
  try {
    // Placeholder response
    const response = new Response('OK');
    logger.info({ requestId, duration: Date.now() - start });
    return response;
  } catch (err: any) {
    logger.error({
      requestId,
      duration: Date.now() - start,
      error: { code: '500', message: err.message, stack: err.stack }
    });
    return new Response('Internal Error', { status: 500 });
  }
}
