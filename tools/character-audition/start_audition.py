#!/usr/bin/env python3
"""Serve the extracted Ask Bill GLB walking lab ONLY on 127.0.0.1.

Open in an existing browser. No user data is uploaded; no background service
persists after closing the process. External 3D viewer currently needs internet.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

ROOT=Path(__file__).resolve().parent

class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.glb':'model/gltf-binary','.mjs':'text/javascript'}
    def end_headers(self):
        self.send_header('Content-Security-Policy',
            "default-src 'none'; base-uri 'none'; form-action 'none'; "
            "script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; "
            "img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net; "
            "worker-src 'self' blob:; frame-ancestors 'none'")
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Frame-Options','DENY')
        super().end_headers()


def start(port=0, open_browser=True):
    if not 0<=port<=65535:raise ValueError('Port out of range')
    if not (ROOT/'assets/bill/characters/dist/manifest.json').is_file():
        raise RuntimeError('Unzip the FULL evaluation kit, keeping its folders intact')
    handler=partial(Handler,directory=str(ROOT))
    server=ThreadingHTTPServer(('127.0.0.1',port),handler)
    url='http://127.0.0.1:'+str(server.server_port)+'/apps/web/preview/compare.html'
    print('Ask Bill 20-character walking laboratory: '+url,flush=True)
    print('Press Ctrl+C to stop. This server is available only on your computer.',flush=True)
    if open_browser:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--port',type=int,default=0)
    p.add_argument('--no-browser',action='store_true')
    a=p.parse_args()
    start(a.port,not a.no_browser)
