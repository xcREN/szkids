# -*- coding: utf-8 -*-
"""
生成小程序图标资源：地图 Marker 大头针 + TabBar 图标 + 地图页悬浮按钮图标。

配色跟 miniprogram/app.wxss 里的变量保持一致（2026 暖白自然色系）：
    森林绿 #4B7A5A  深绿 #3A6248  雾蓝 #3F7F8C
    陶土   #B5714C  紫灰 #7E6A92  暖灰 #9AA096

TabBar 图标是自己画的线性图标，未选中=线框灰，选中=实心绿，
和 iOS 一贯的做法一致，比 emoji 干净。

跑法（需要 Python + Pillow）：
    python tools/gen_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "miniprogram", "images")
EMOJI = r"C:\Windows\Fonts\seguiemj.ttf"

GREEN = "#4B7A5A"      # 户外自然
TEAL = "#3F7F8C"       # 玩水、海边
CLAY = "#B5714C"       # 文化室内
PLUM = "#7E6A92"       # 游乐运动
TAB_OFF = "#9AA096"    # TabBar 未选中
TAB_ON = "#3A6248"     # TabBar 选中
UI_ICON = "#3A6248"    # 地图页悬浮按钮里的图标

# 分类 -> (emoji, 主题色)。颜色只有四组，保持统一视觉体系
CATS = {
    "park":       ("\U0001F333", GREEN),
    "climbing":   ("\U0001F9D7", GREEN),
    "cycling":    ("\U0001F6B2", GREEN),
    "camping":    ("\u26FA",     GREEN),
    "hiking":     ("\U0001F97E", GREEN),
    "nature":     ("\U0001F33F", GREEN),
    "farm":       ("\U0001F404", GREEN),
    "animal":     ("\U0001F992", GREEN),
    "water":      ("\U0001F4A6", TEAL),
    "seaside":    ("\U0001F3D6", TEAL),
    "museum":     ("\U0001F3DB", CLAY),
    "science":    ("\U0001F52C", CLAY),
    "library":    ("\U0001F4DA", CLAY),
    "art":        ("\U0001F3A8", CLAY),
    "playground": ("\U0001F3A0", PLUM),
    "sports":     ("\u26F9",     PLUM),
}


# ---------------------------------------------------------------- Marker

def marker(emoji, color, out, s=2):
    """白底 + 彩色描边的水滴形大头针，中间放分类 emoji。"""
    W, H = 120 * s, 150 * s
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(30 * s, 88 * s), (90 * s, 88 * s), (60 * s, 147 * s)], fill=color)
    d.ellipse([8 * s, 6 * s, 112 * s, 110 * s], fill=color)
    d.ellipse([19 * s, 17 * s, 101 * s, 99 * s], fill="#FFFFFF")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((60 * s, 58 * s), emoji,
                               font=ImageFont.truetype(EMOJI, 60 * s),
                               embedded_color=True, anchor="mm")
    im.alpha_composite(layer)
    im.resize((120, 150), Image.LANCZOS).save(out)


def marker_gray(out, s=2):
    """童年地图上「还没去过」的点：小一号的灰空心针，视觉上退到后面。"""
    W, H = 120 * s, 150 * s
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    grey = "#B9BCB2"
    d.polygon([(38 * s, 92 * s), (82 * s, 92 * s), (60 * s, 143 * s)], fill=grey)
    d.ellipse([20 * s, 18 * s, 100 * s, 98 * s], fill=grey)
    d.ellipse([32 * s, 30 * s, 88 * s, 86 * s], fill="#FFFFFF")
    d.ellipse([50 * s, 48 * s, 70 * s, 68 * s], fill=grey)
    im.resize((120, 150), Image.LANCZOS).save(out)


# ---------------------------------------------------------------- TabBar
# 统一在 4 倍画布上画，最后缩到 81x81。
# mode = "line" 线框（未选中） / "fill" 实心（选中）

N = 81 * 4
STROKE = int(N * 0.062)


def _new():
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def _pin(d, mode, c):
    """定位大头针：圆 + 下方尖角。
    线框版把圆弧底部留一个缺口（50°~130°），两条切线接到尖点，
    这样才是一个完整的水滴轮廓，而不是「圆 + 一个 V」。"""
    import math
    cx, cy, r = N * 0.5, N * 0.40, N * 0.235
    box = [cx - r, cy - r, cx + r, cy + r]
    tip = (cx, cy + r * 2.15)
    # PIL 的 0° 在 3 点钟方向，顺时针增加；底部是 90°
    a = math.radians(50)
    right = (cx + r * math.cos(a), cy + r * math.sin(a))
    left = (cx - r * math.cos(a), cy + r * math.sin(a))
    if mode == "fill":
        d.ellipse(box, fill=c)
        d.polygon([left, right, tip], fill=c)
        h = r * 0.40
        d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=(0, 0, 0, 0))
    else:
        d.arc(box, 130, 410, fill=c, width=STROKE)
        d.line([left, tip, right], fill=c, width=STROKE, joint="curve")
        h = r * 0.33
        d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=c)


def _compass(d, mode, c):
    """指南针：圆 + 指针"""
    cx, cy, r = N * 0.5, N * 0.5, N * 0.36
    needle = [(cx + r * 0.52, cy - r * 0.52), (cx + r * 0.16, cy + r * 0.16),
              (cx - r * 0.52, cy + r * 0.52), (cx - r * 0.16, cy - r * 0.16)]
    if mode == "fill":
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
        d.polygon(needle, fill=(0, 0, 0, 0))
    else:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=STROKE)
        d.polygon(needle, fill=c)


def _flag(d, mode, c):
    """小旗：插旗 = 「我们来过」，正好对应童年地图。
    试过脚印，两个椭圆叠出来的脚掌缩到 27pt 会糊成一团，换成旗子更清楚。"""
    px = N * 0.30                                  # 旗杆 x
    d.line([(px, N * 0.14), (px, N * 0.90)], fill=c, width=STROKE)
    d.line([(N * 0.18, N * 0.90), (N * 0.62, N * 0.90)], fill=c, width=int(STROKE * 0.9))
    tri = [(px, N * 0.17), (N * 0.82, N * 0.34), (px, N * 0.51)]
    if mode == "fill":
        d.polygon(tri, fill=c)
    else:
        d.line(tri + [tri[0]], fill=c, width=STROKE, joint="curve")


def _person(d, mode, c):
    """人像：头 + 肩"""
    hr = N * 0.155
    hcx, hcy = N * 0.5, N * 0.30
    body = [N * 0.20, N * 0.52, N * 0.80, N * 1.06]
    if mode == "fill":
        d.ellipse([hcx - hr, hcy - hr, hcx + hr, hcy + hr], fill=c)
        d.pieslice(body, 180, 360, fill=c)
    else:
        d.ellipse([hcx - hr, hcy - hr, hcx + hr, hcy + hr], outline=c, width=STROKE)
        d.arc(body, 180, 360, fill=c, width=STROKE)


# ---------------------------------------------------------------- 悬浮按钮
# 地图页右侧那两个圆按钮里的图标。
#
# 为什么不用 CSS 背景图或 SVG：
#   小程序的 WXSS 里 background-image **不支持本地文件路径**（只能网络图或
#   base64），而 SVG 的 data URI 在部分基础库上根本渲染不出来 —— 试过，
#   结果是一个空白圆圈。所以老老实实生成 PNG，用 <image> 组件显示。

def _icon_list(d, c):
    """列表：三条横线 + 行首圆点，和「地图」区分得开"""
    x0, x1 = N * 0.36, N * 0.86
    dot_x, dot_r = N * 0.20, N * 0.055
    for y in (N * 0.28, N * 0.5, N * 0.72):
        d.line([(x0, y), (x1, y)], fill=c, width=STROKE)
        d.ellipse([dot_x - dot_r, y - dot_r, dot_x + dot_r, y + dot_r], fill=c)


def _icon_map(d, c):
    """折叠地图：三折的梯形轮廓 + 两条折线"""
    p = [(N * 0.14, N * 0.28), (N * 0.38, N * 0.18), (N * 0.62, N * 0.28),
         (N * 0.86, N * 0.18), (N * 0.86, N * 0.74), (N * 0.62, N * 0.84),
         (N * 0.38, N * 0.74), (N * 0.14, N * 0.84)]
    d.line(p + [p[0]], fill=c, width=STROKE, joint="curve")
    d.line([(N * 0.38, N * 0.18), (N * 0.38, N * 0.74)], fill=c, width=STROKE)
    d.line([(N * 0.62, N * 0.28), (N * 0.62, N * 0.84)], fill=c, width=STROKE)


def _icon_locate(d, c):
    """准星：外圈 + 四向短刻度 + 中心实心点。比一个孤零零的圆更像「定位」"""
    cx, cy, r = N * 0.5, N * 0.5, N * 0.28
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=STROKE)
    t0, t1 = r * 1.18, r * 1.62
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        d.line([(cx + dx * t0, cy + dy * t0), (cx + dx * t1, cy + dy * t1)],
               fill=c, width=STROKE)
    h = r * 0.34
    d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=c)


def ui_icon(kind, out, color=UI_ICON):
    im, d = _new()
    {"list": _icon_list, "map": _icon_map, "locate": _icon_locate}[kind](d, color)
    im.resize((72, 72), Image.LANCZOS).save(out)


def tab_icon(kind, mode, color, out):
    im, d = _new()
    if kind == "map":
        _pin(d, mode, color)
    elif kind == "discover":
        _compass(d, mode, color)
    elif kind == "timeline":
        _flag(d, mode, color)
    elif kind == "mine":
        _person(d, mode, color)
    im.resize((81, 81), Image.LANCZOS).save(out)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "markers"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "tabbar"), exist_ok=True)
    for k, (e, col) in CATS.items():
        marker(e, col, os.path.join(ROOT, "markers", k + ".png"))
    marker_gray(os.path.join(ROOT, "markers", "_unvisited.png"))
    for k in ("map", "discover", "timeline", "mine"):
        tab_icon(k, "line", TAB_OFF, os.path.join(ROOT, "tabbar", k + ".png"))
        tab_icon(k, "fill", TAB_ON, os.path.join(ROOT, "tabbar", k + "-active.png"))

    os.makedirs(os.path.join(ROOT, "ui"), exist_ok=True)
    for k in ("list", "map", "locate"):
        ui_icon(k, os.path.join(ROOT, "ui", k + ".png"))

    print("生成完成：%d 个 marker（含未去过灰针），8 个 tabbar 图标，3 个悬浮按钮图标"
          % (len(CATS) + 1))
