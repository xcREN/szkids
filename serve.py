#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地静态网站服务器 —— 给 Cloudflare Tunnel 用
只监听 127.0.0.1:8080（外网进不来，只有隧道能连），
并且只对外提供 index.html 和 photos/ 里的图片，其它文件一律 404。

启动：  python serve.py
停止：  Ctrl + C
"""
import os
import sys
import posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
PORT = 8080

# 允许对外访问的文件（其它一律 404，比如 天气.png、.git、serve.py 本身）
ALLOW_FILES = {"index.html", "favicon.ico"}
ALLOW_DIRS = ("photos",)
ALLOW_EXTS = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp",
              ".gif", ".svg", ".ico", ".mp4", ".mov"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _allowed(self, path: str) -> bool:
        rel = unquote(path.split("?", 1)[0].split("#", 1)[0]).lstrip("/")
        rel = posixpath.normpath(rel) if rel else ""
        if rel in ("", "."):                       # 首页
            return True
        if rel.startswith("..") or rel.startswith("/"):   # 目录穿越
            return False
        if any(part.startswith(".") for part in rel.split("/")):  # .git 等隐藏文件
            return False
        if rel in ALLOW_FILES:
            return True
        # 根目录下的 .txt 放行：微信/搜索引擎等平台的域名归属验证文件
        if "/" not in rel and rel.lower().endswith(".txt"):
            return True
        head = rel.split("/", 1)[0]
        if head in ALLOW_DIRS and os.path.splitext(rel)[1].lower() in ALLOW_EXTS:
            return True
        return False

    def send_head(self):
        if not self._allowed(self.path):
            self.send_error(404, "Not Found")
            return None
        return super().send_head()

    def guess_type(self, path):
        # 显式带上 charset，避免微信内置浏览器把中文认成乱码
        t = super().guess_type(path)
        if t in ("text/html", "text/css", "application/javascript", "text/javascript"):
            return t + "; charset=utf-8"
        return t

    def end_headers(self):
        # 内容改了就立刻生效，不让浏览器/CDN 缓存旧版
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def list_directory(self, path):        # 禁止列目录
        self.send_error(404, "Not Found")
        return None

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    if not os.path.exists(os.path.join(ROOT, "index.html")):
        sys.exit("错误：同目录下找不到 index.html")
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"网站根目录: {ROOT}")
    print(f"本地地址  : http://{HOST}:{PORT}/   （按 Ctrl+C 停止）")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        srv.server_close()
