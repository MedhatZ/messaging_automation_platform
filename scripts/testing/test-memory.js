/**
 * Semantic memory test via HTTP API.
 *
 * What it does:
 * - Logs in using /auth/login
 * - Sends two chat messages using /chat/process (same externalUserId)
 * - Fetches /conversations and finds the conversation
 * - Searches semantic memory for a keyword via /conversations/:id/memory/search
 *
 * Required env:
 * - API_BASE_URL (default http://localhost:3000)
 * - EMAIL
 * - PASSWORD
 *
 * Optional env:
 * - EXTERNAL_USER_ID (default "201000000000")
 */

async function http(method, url, { headers, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(headers || {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  return { status: res.status, json, text };
}

async function main() {
  const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  const externalUserId = process.env.EXTERNAL_USER_ID || '201000000000';

  if (!email || !password) {
    throw new Error('EMAIL and PASSWORD are required');
  }

  const login = await http('POST', `${base}/auth/login`, {
    body: { email, password },
  });
  if (login.status !== 201 && login.status !== 200) {
    throw new Error(`login failed: ${login.status} ${login.text}`);
  }
  const token = login.json?.accessToken;
  if (!token) throw new Error('missing accessToken');

  const auth = { Authorization: `Bearer ${token}` };

  // Send two messages (same customer -> same conversation)
  const m1 = await http('POST', `${base}/chat/process`, {
    headers: auth,
    body: {
      channelType: 'WHATSAPP',
      externalUserId,
      externalUserName: 'Test User',
      message: 'I want products please',
    },
  });
  if (m1.status !== 201 && m1.status !== 200) {
    throw new Error(`chat process 1 failed: ${m1.status} ${m1.text}`);
  }

  const secretPhrase = `memory-${Date.now()}`;
  const m2 = await http('POST', `${base}/chat/process`, {
    headers: auth,
    body: {
      channelType: 'WHATSAPP',
      externalUserId,
      externalUserName: 'Test User',
      message: `please remember ${secretPhrase}`,
    },
  });
  if (m2.status !== 201 && m2.status !== 200) {
    throw new Error(`chat process 2 failed: ${m2.status} ${m2.text}`);
  }

  const convs = await http('GET', `${base}/conversations`, { headers: auth });
  if (convs.status !== 200) {
    throw new Error(`conversations failed: ${convs.status} ${convs.text}`);
  }
  const list = Array.isArray(convs.json) ? convs.json : [];
  const conv = list.find((c) => c.externalUserId === externalUserId) || list[0];
  if (!conv?.id) throw new Error('conversation not found');

  const search = await http(
    'GET',
    `${base}/conversations/${conv.id}/memory/search?q=${encodeURIComponent(secretPhrase)}`,
    { headers: auth },
  );
  if (search.status !== 200) {
    throw new Error(`memory search failed: ${search.status} ${search.text}`);
  }

  const results = Array.isArray(search.json) ? search.json : [];
  const hit = results.some((r) => (r.messageText || '').includes(secretPhrase));
  if (!hit) {
    throw new Error(`expected memory hit for ${secretPhrase}, got ${JSON.stringify(results)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        conversationId: conv.id,
        resultsCount: results.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

