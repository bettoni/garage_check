#!/usr/bin/env python3
"""Local dev server with CORS proxy for nhw.de."""
import http.server
import urllib.request
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
PROXY_PREFIX = '/proxy/'
TARGET = 'https://www.nhw.de'

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            remote_path = self.path[len(PROXY_PREFIX):]
            url = TARGET + '/' + remote_path
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', resp.headers.get('Content-Type', 'text/html'))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f'Serving on http://localhost:{PORT}')
print(f'Proxy: http://localhost:{PORT}/proxy/zuhause-finden/stellplatz-mieten')
http.server.HTTPServer(('', PORT), Handler).serve_forever()
