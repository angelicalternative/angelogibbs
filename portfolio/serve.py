import http.server
import os

PORT = 4890
os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.test(
    HandlerClass=http.server.SimpleHTTPRequestHandler,
    port=PORT,
)
