/**
 * Elisa OpenAI Proxy - Cloudflare Worker
 *
 * Proxies OpenAI API requests with workshop code auth.
 * Keeps your API key secret while allowing students to use the app.
 */

export interface Env {
  OPENAI_API_KEY: string;
  WORKSHOP_CODE: string;
}

const OPENAI_BASE = 'https://api.openai.com';

// CORS headers for Electron app
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Workshop-Code, X-Student-Id',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'elisa-openai-proxy' }, { headers: corsHeaders });
    }

    // Validate workshop code
    const workshopCode = request.headers.get('X-Workshop-Code') || url.searchParams.get('code');
    if (workshopCode !== env.WORKSHOP_CODE) {
      return Response.json(
        { error: 'Invalid workshop code' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Optional: track student ID for usage logging
    const studentId = request.headers.get('X-Student-Id') || 'anonymous';

    // Only proxy OpenAI API paths
    if (!url.pathname.startsWith('/v1/')) {
      return Response.json(
        { error: 'Only /v1/* endpoints are supported' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Forward request to OpenAI
    const openaiUrl = `${OPENAI_BASE}${url.pathname}${url.search}`;

    const openaiRequest = new Request(openaiUrl, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: request.method !== 'GET' ? await request.text() : undefined,
    });

    console.log(`[${studentId}] ${request.method} ${url.pathname}`);

    try {
      const response = await fetch(openaiRequest);

      // Stream the response back
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      console.error('OpenAI request failed:', err);
      return Response.json(
        { error: 'Failed to reach OpenAI API' },
        { status: 502, headers: corsHeaders }
      );
    }
  },
};
