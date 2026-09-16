#!/usr/bin/env python3
import json, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(ROOT), 'relayer_state.json')
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()
    def do_GET(self):
        if self.path == '/api/status':
            # chain labels + the explorer of the chain the relay tx landed on (the destination)
            LABEL = {'bot': 'BOT Chain', 'arb': 'Arbitrum Sepolia', 'base': 'Base Sepolia', 'arc': 'Arc Testnet'}
            EXPLORER = {'bot': 'https://scan.bohr.life/tx/', 'arb': 'https://sepolia.arbiscan.io/tx/',
                        'base': 'https://sepolia.basescan.org/tx/', 'arc': 'https://testnet.arcscan.app/tx/'}
            recent=[]
            try:
                with open(STATE) as f: state=json.load(f)
                for msg in state.get('messages', {}).values():
                    source = msg.get('source', '')                 # e.g. "base->bot"
                    src, _, dst = source.partition('->')
                    recent.append({
                        'direction': f"{LABEL.get(src, src)} → {LABEL.get(dst, dst)}",
                        'sourceKey': src,
                        'destinationKey': dst,
                        'time': msg.get('at', '').replace('T', ' ')[:16],
                        'relayTx': msg.get('relayTx'),
                        'explorer': EXPLORER.get(dst, '') + (msg.get('relayTx') or ''),
                    })
            except (OSError, json.JSONDecodeError): pass
            recent.sort(key=lambda x:x.get('time',''), reverse=True)
            body=json.dumps({'status':'online','route':'4-chain Hyperlane mesh: BOT Chain ↔ Arbitrum ↔ Base ↔ Arc (12 routes)','recent':recent[:8]}).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def log_message(self, fmt, *args): pass

os.chdir(ROOT)
port=int(os.environ.get('PORT','8088'))
print(f'Frontend listening on 0.0.0.0:{port}', flush=True)
ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
