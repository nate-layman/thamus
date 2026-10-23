#!/usr/bin/env python3
"""Serve docs/ on a laptop and proxy /v1/* to MindRouter's public proxy.

The published page calls the proxy cross-origin, and the proxy allows only the
published origins. A plain static server on localhost therefore gets CORS errors
on the model calls. This server forwards /v1/* server-to-server with the
visitor's own bearer key and nothing else, the way the add-in hosts in
mindrouter-365 do. The MCP calls (eCFR, web search) go direct; that server
allows any origin.

    python3 scripts/serve.py            # http://localhost:4173
    python3 scripts/serve.py 8080
"""
import http.server
import sys
import urllib.error
import urllib.request
from pathlib import Path

UPSTREAM = "https://nlayman-external.insight.uidaho.edu"
DOCS = Path(__file__).resolve().parent.parent / "docs"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
HOP = {"host", "origin", "referer", "cookie", "connection", "content-length", "accept-encoding"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(DOCS), **kw)

    def do_GET(self):
        if self.path.startswith("/v1/"):
            return self.proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/v1/"):
            return self.proxy("POST")
        self.send_error(405)

    def proxy(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() in ("content-type",):
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:  # noqa: BLE001
            self.send_error(502, f"upstream: {e}")

    def end_headers(self):
        # A laptop server is for editing: never let the browser cache a stale module.
        if not self.path.startswith("/v1/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Never log a request line that could carry a key.
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))


if __name__ == "__main__":
    print(f"Serving {DOCS} at http://localhost:{PORT}  (proxying /v1/* to {UPSTREAM})")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
