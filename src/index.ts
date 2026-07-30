// src/index.ts
import { createServer } from 'node:http';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(response));
    return;
  }

  // 기본 응답
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Hello from TypeScript + tsx server2!');
});

// 서버 시작
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
