#!/usr/bin/env node
// Gate a trained candidate on the repo's oracle eval (the ONLY accuracy gate).
//
// Serve the candidate first (custom Qwen3-VL GGUF cannot be imported into
// Ollama — ollama/ollama#13101, #16264):
//   vllm serve <merged-dir> --served-model-name qwen3vl-inventory      # :8000
//   llama-server -m model-f16.gguf --mmproj mmproj-f16.gguf --port 8080
//
// Usage: node training/eval_candidate.mjs <candidate-name> [--url http://localhost:8000/v1]
//
// The repo harness only speaks the Ollama /api/generate protocol, so this
// wrapper runs a local Ollama->OpenAI translation proxy and points
// OLLAMA_BASE_URL at it — eval/ stays untouched.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RUNS_DIR = path.join(REPO_ROOT, 'training', 'runs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: node training/eval_candidate.mjs <candidate-name> [--url <openai-base-url>]');
    process.exit(1);
  }
  const urlIdx = args.indexOf('--url');
  const url = urlIdx !== -1 ? args[urlIdx + 1] : 'http://localhost:8000/v1';
  return { name, url: url.replace(/\/$/, '') };
}

function startProxy(openaiBase, servedModel) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/api/generate')) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const content = [{ type: 'text', text: body.prompt ?? '' }];
      for (const img of body.images ?? []) {
        content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
      }
      const upstream = await fetch(`${openaiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: servedModel,
          messages: [{ role: 'user', content }],
          temperature: body.options?.temperature ?? 0.2,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(600_000),
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: text.slice(0, 300) }));
        return;
      }
      const data = await upstream.json();
      const response = data.choices?.[0]?.message?.content ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response, done: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function newestReport() {
  const evalDir = path.join(REPO_ROOT, 'eval');
  const reports = (await fs.readdir(evalDir)).filter((f) => /^report-.*\.json$/.test(f));
  let best = null;
  for (const f of reports) {
    const stat = await fs.stat(path.join(evalDir, f));
    if (!best || stat.mtimeMs > best.mtimeMs) best = { f, mtimeMs: stat.mtimeMs };
  }
  return best ? path.join(evalDir, best.f) : null;
}

async function main() {
  const { name, url } = parseArgs(process.argv);
  const proxy = await startProxy(url, name);
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  console.log(`proxy: ${proxyUrl} -> ${url} (model=${name})`);

  const before = await newestReport();
  const code = await new Promise((resolve) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'eval', 'harness.mjs'), name], {
      stdio: 'inherit',
      env: { ...process.env, OLLAMA_BASE_URL: proxyUrl },
    });
    child.on('close', resolve);
  });
  proxy.close();
  if (code !== 0) process.exit(code ?? 1);

  const report = await newestReport();
  if (report && report !== before) {
    await fs.mkdir(RUNS_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const dest = path.join(RUNS_DIR, `candidate-${name.replace(/[/:]/g, '_')}-${stamp}.json`);
    await fs.copyFile(report, dest);
    console.log(`\ncandidate report: ${dest}`);
    console.log('compare against eval/baseline.json before promoting anything.');
  }
}

await main();
