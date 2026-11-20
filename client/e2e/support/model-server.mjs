// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The e2e suite's model: a real HTTP server that answers `POST /v1/chat/completions` as an
 * OpenAI-compatible endpoint does, streaming a fixed reply word by word, and `GET /health`.
 * The reply names how many messages it was given, so a spec can see the prompt changed.
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 47211);
const WORD_DELAY_MS = 30;

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const words = `*looks up* "Mind the coolant." (${body.messages.length} messages)`.split(' ');
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (index) => {
      if (index === words.length) {
        response.end('data: [DONE]\n\n');
        return;
      }
      const content = index === 0 ? words[index] : ` ${words[index]}`;
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      setTimeout(() => send(index + 1), WORD_DELAY_MS);
    };
    send(0);
  });
}).listen(port, '127.0.0.1');
