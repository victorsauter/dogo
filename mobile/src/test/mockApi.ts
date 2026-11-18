import { jsonResponse, problemResponse } from './fixtures';

export interface MockRequest {
  method: string;
  /** Path and query, without the origin (`/api/v1/dogs/abc`). */
  path: string;
  /** Parsed JSON body; `undefined` for no body or multipart. */
  json?: unknown;
  contentType: string | null;
  request: Request;
}

export type MockHandler = (request: MockRequest) => Response | Promise<Response>;

/**
 * Replaces the global `fetch` with a router: keys are `"METHOD /api/v1/path"`.
 * Unknown routes answer 404; sign-out's logout call always answers 204.
 * Returns the recorded calls, in order.
 */
export function mockApi(routes: Record<string, MockHandler>) {
  const calls: MockRequest[] = [];
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const contentType = request.headers.get('content-type');
    let json: unknown;
    if (contentType?.includes('json')) {
      try {
        json = await request.clone().json();
      } catch {
        json = undefined;
      }
    }
    const call: MockRequest = {
      method: request.method,
      path: url.pathname + url.search,
      json,
      contentType,
      request,
    };
    calls.push(call);
    if (call.method === 'POST' && url.pathname.endsWith('/auth/logout')) {
      return new Response(null, { status: 204 });
    }
    const handler = routes[`${call.method} ${url.pathname}`];
    return handler ? handler(call) : problemResponse(404, 'not_found');
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
}

export const ok = (body: unknown) => jsonResponse(body);
export { jsonResponse, problemResponse };
