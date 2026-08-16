// Stream Service — Native fetch + ReadableStream SSE parser
// Handles multi-event chunks, partial line buffers, and AbortController cancellation

export interface SSEEvent {
  event: 'start' | 'status' | 'token' | 'done' | 'error';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export async function postSSE(
  path: string,
  payload: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let errorMsg = 'Failed to connect to streaming endpoint.';
    try {
      const errJson = await response.json();
      if (errJson.message) errorMsg = errJson.message;
    } catch {
      // Ignore parse error
    }
    throw new Error(errorMsg);
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported by browser/server.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const fetchStart = Date.now();
  let frontendChunkCount = 0;

  console.log(`[STREAM_FRONTEND] CONNECTED t=0ms`);

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log(`[STREAM_FRONTEND] END t=${Date.now() - fetchStart}ms totalChunks=${frontendChunkCount}`);
      break;
    }

    frontendChunkCount++;
    const elapsed = Date.now() - fetchStart;
    console.log(`[STREAM_FRONTEND] FRONTEND_CHUNK_RECEIVED #${frontendChunkCount} t=${elapsed}ms size=${value.length}bytes`);

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages separated by double newlines (\n\n)
    const blocks = buffer.split('\n\n');
    // Keep incomplete trailing buffer block
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      if (!block.trim()) continue;

      let currentEvent = 'token';
      let currentData = '';

      const lines = block.split('\n');
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData += line.slice(5).trim();
        }
      }

      if (currentData) {
        try {
          const parsedData = JSON.parse(currentData);
          onEvent({ event: currentEvent as SSEEvent['event'], data: parsedData });
        } catch (err) {
          console.warn('[SSE] Failed to parse event JSON data:', currentData, err);
        }
      }
    }
  }
}
