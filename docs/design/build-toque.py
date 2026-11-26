# Gera docs/design/toque-canvas.png ("Repouso Perturbado"): a interação com o pêndulo da Início desenhada como
# exposição longa. A física é a MESMA do app (assets/pend-touch.js): θ'' = -k(θ - alvo) - c θ', k = 49, c = 3,5.
# Uso: python3 docs/design/build-toque.py <pasta das fontes>
import math
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "fonts"
S = 2  # supersample
W, H = 2400, 3200
BG0, BG1 = (5, 7, 13), (10, 16, 32)
MINT = (53, 224, 161)
PERI = (140, 155, 255)
IVORY = (233, 238, 248)
CORAL = (255, 111, 131)
AMBER = (242, 194, 101)

K, C = 49.0, 3.5
DT = 1 / 600
T_TOUCH, T_RELEASE, T_END = 0.40, 1.45, 4.40
OLD, NEW = 15.0, -11.0  # graus (positivo = defesa, à esquerda, como no app)


def pointer(t):
    """Caminho do ponteiro durante o toque: entra pela esquerda, cruza, hesita e volta um pouco."""
    u = (t - T_TOUCH) / (T_RELEASE - T_TOUCH)
    return OLD + (-24 - OLD) * (0.5 - 0.5 * math.cos(math.pi * min(1, u * 1.6))) + 9 * math.sin(math.pi * max(0, u - 0.62) / 0.38) * (u > 0.62)  # noqa: E501


def simulate():
    th, om, t = OLD, 0.0, 0.0
    out = []
    while t <= T_END:
        if t < T_TOUCH:
            target = OLD
        elif t < T_RELEASE:
            target = pointer(t)
        else:
            target = NEW
        acc = -K * (th - target) - C * om
        om += acc * DT
        th += om * DT
        out.append((t, th))
        t += DT
    return out


TRACE = simulate()
SETTLE = next(t for t, th in TRACE if t > T_RELEASE and all(abs(x - NEW) < 0.25 for tt, x in TRACE if tt >= t))


def font(name, size):
    return ImageFont.truetype(f"{FONTS}/{name}", size * S)


img = Image.new("RGB", (W * S, H * S), BG0)
px = img.load()
# chão: gradiente vertical azul de madrugada, mais claro no centro alto
for y in range(H * S):
    k = y / (H * S)
    col = tuple(int(BG0[i] + (BG1[i] - BG0[i]) * math.sin(math.pi * min(1, k * 1.25)) ** 1.2) for i in range(3))
    for x in range(0, W * S):
        px[x, y] = col
d = ImageDraw.Draw(img, "RGBA")


def WD(v):
    return max(1, round(v * S))


def P(v):
    return v * S


def mix(a, b, u):
    return tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))


boxes = []


def text(xy, s, f, fill, anchor="la"):
    d.text((P(xy[0]), P(xy[1])), s, font=f, fill=fill, anchor=anchor)
    boxes.append((d.textbbox((P(xy[0]), P(xy[1])), s, font=f, anchor=anchor), s))


# ── pêndulo ──
PX, PY, R = 1200, 470, 1330
RS = 1440  # raio da escala


def tip(deg, r=R):
    a = math.radians(deg)
    return (PX - r * math.sin(a), PY + r * math.cos(a))


# escala: cinco faixas finas e ticks a cada 2°
MAXD = 40
bands = [(-100, -60, CORAL, 1.0), (-60, -20, CORAL, 0.55), (-20, 20, AMBER, 0.45), (20, 60, MINT, 0.55), (60, 100, MINT, 1.0)]  # noqa: E501
for lo, hi, col, a in bands:
    d0, d1 = -lo / 100 * MAXD, -hi / 100 * MAXD
    pts = [tip(d0 + (d1 - d0) * i / 80, RS) for i in range(81)]
    gap = 0.6 if abs(lo) != 100 else 0
    d.line([(P(x), P(y)) for x, y in pts[1:-1]], fill=col + (int(170 * a),), width=WD(5))
for k in range(-20, 21):
    deg = k * 2
    (x1, y1), (x2, y2) = tip(deg, RS + 26), tip(deg, RS + (64 if k % 5 == 0 else 44))
    d.line([(P(x1), P(y1)), (P(x2), P(y2))], fill=IVORY + ((110 if k % 5 == 0 else 55),), width=WD(2 if k % 5 == 0 else 1)) # noqa: E501

# antes: haste fantasma tracejada em marfim
ox, oy = tip(OLD)
n = 46
for i in range(0, n, 2):
    a0, a1 = i / n, (i + 1) / n
    d.line([(P(PX + (ox - PX) * a0), P(PY + (oy - PY) * a0)), (P(PX + (ox - PX) * a1), P(PY + (oy - PY) * a1))], fill=IVORY + (70,), width=WD(2)) # noqa: E501
d.ellipse([P(ox - 18), P(oy - 18), P(ox + 18), P(oy + 18)], outline=IVORY + (90,), width=WD(2))

# exposição: uma haste a cada 1/36 s, do toque ao repouso; periwinkle na mão, menta depois de soltar
FR = 1 / 36
samples = [(t, th) for t, th in TRACE[:: int(FR / DT)] if T_TOUCH <= t <= SETTLE + 0.05]
for i, (t, th) in enumerate(samples):
    u = i / (len(samples) - 1)
    if t < T_RELEASE:
        col, alpha = PERI, int(26 + 60 * (t - T_TOUCH) / (T_RELEASE - T_TOUCH))
    else:
        w = min(1, (t - T_RELEASE) / 0.9)
        col, alpha = mix(PERI, MINT, w), int(40 + 70 * u)
    x, y = tip(th)
    d.line([(P(PX), P(PY)), (P(x), P(y))], fill=col + (alpha,), width=WD(1.6))
    d.ellipse([P(x - 6), P(y - 6), P(x + 6), P(y + 6)], fill=col + (min(255, alpha + 40),))

# o toque: anéis concêntricos onde a mão pegou o peso
hx, hy = tip(next(th for t, th in TRACE if t >= T_TOUCH + 0.18))
for r, a in ((30, 150), (54, 90), (82, 50), (114, 24)):
    d.ellipse([P(hx - r), P(hy - r), P(hx + r), P(hy + r)], outline=PERI + (a,), width=WD(2))

# repouso: haste nítida na leitura nova
nx, ny = tip(NEW)
d.line([(P(PX), P(PY)), (P(nx), P(ny))], fill=MINT + (255,), width=WD(6))
for r, a in ((78, 18), (56, 34)):
    d.ellipse([P(nx - r), P(ny - r), P(nx + r), P(ny + r)], fill=MINT + (a,))
d.ellipse([P(nx - 34), P(ny - 34), P(nx + 34), P(ny + 34)], fill=MINT + (255,))
d.ellipse([P(nx - 22), P(ny - 26), P(nx - 4), P(ny - 8)], fill=(255, 255, 255, 120))
d.ellipse([P(PX - 14), P(PY - 14), P(PX + 14), P(PY + 14)], fill=IVORY + (255,))
d.ellipse([P(PX - 26), P(PY - 26), P(PX + 26), P(PY + 26)], outline=IVORY + (80,), width=WD(2))

# ── a mesma história no tempo ──
GX0, GX1, GY0, GY1 = 260, 2140, 2230, 2860
tx = lambda t: GX0 + (GX1 - GX0) * t / T_END  # noqa: E731
ty = lambda th: (GY0 + GY1) / 2 + th / 32 * (GY1 - GY0) / 2  # noqa: E731
# grade de tempo: tick a cada 0,1 s, maior a cada 0,5 s
for i in range(int(T_END * 10) + 1):
    t = i / 10
    major = i % 5 == 0
    d.line([(P(tx(t)), P(GY1 + 28)), (P(tx(t)), P(GY1 + (52 if major else 40)))], fill=IVORY + ((110 if major else 45),), width=WD(2 if major else 1)) # noqa: E501
d.line([(P(GX0), P(GY1 + 28)), (P(GX1), P(GY1 + 28))], fill=IVORY + (60,), width=WD(1))
# níveis antes/depois
for lvl, col, a in ((OLD, IVORY, 80), (NEW, MINT, 120)):
    for x in range(GX0, GX1, 22):
        d.line([(P(x), P(ty(lvl))), (P(min(x + 10, GX1)), P(ty(lvl)))], fill=col + (a,), width=WD(1.5))
# envelope do amortecimento após soltar
zw = C / 2
th_rel = next(th for t, th in TRACE if t >= T_RELEASE)
A0 = abs(th_rel - NEW)
for sgn in (1, -1):
    pts = [(P(tx(t)), P(ty(NEW + sgn * A0 * math.exp(-zw * (t - T_RELEASE))))) for t in [T_RELEASE + i * 0.01 for i in range(int((T_END - T_RELEASE) / 0.01))]] # noqa: E501
    d.line(pts, fill=MINT + (55,), width=WD(1.5))
# a curva
prev = None
for t, th in TRACE[::3]:
    if t < T_TOUCH:
        col, a = IVORY, 150
    elif t < T_RELEASE:
        col, a = PERI, 235
    else:
        col, a = mix(PERI, MINT, min(1, (t - T_RELEASE) / 0.9)), 245
    cur = (P(tx(t)), P(ty(th)))
    if prev:
        d.line([prev, cur], fill=col + (a,), width=WD(3))
    prev = cur
# marcos verticais
for t, col in ((T_TOUCH, PERI), (T_RELEASE, PERI), (SETTLE, MINT)):
    for y in range(GY0 - 40, GY1 + 20, 16):
        d.line([(P(tx(t)), P(y)), (P(tx(t)), P(y + 7))], fill=col + (90,), width=WD(1.5))

# ── tipografia: sussurro ──
mono = font("GeistMono-Regular.ttf", 22)
mono_s = font("GeistMono-Regular.ttf", 19)
serif_i = font("InstrumentSerif-Italic.ttf", 64)
jura = font("Jura-Light.ttf", 24)
text((160, 150), "Repouso Perturbado", serif_i, IVORY + (235,))
text((160, 232), "PL. 04  ·  PRUMO NOTURNO  ·  INTERAÇÃO", mono_s, IVORY + (120,))
text((2240, 146), "θ em graus", jura, IVORY + (150,), "ra")
text((2240, 182), "+ defesa   − risco", mono_s, IVORY + (80,), "ra")
ax, ay = tip(OLD, RS + 130)
text((ax, ay), "antes", mono, IVORY + (150,), "ma")
text((hx + 140, hy - 10), "toque", mono, PERI + (230,), "la")
rx, ry = tip(NEW, RS + 130)
text((rx, ry), "repouso · leitura nova", mono, MINT + (240,), "ma")
text((tx(T_TOUCH) + 12, GY0 - 64), "toque", mono_s, PERI + (220,))
text((tx(T_RELEASE) + 12, GY0 - 64), "solta", mono_s, PERI + (220,))
text((tx(SETTLE) + 12, GY0 - 64), f"repouso  {SETTLE:.2f} s".replace(".", ","), mono_s, MINT + (230,))
text((GX0, ty(OLD) - 34), f"{OLD:+.0f}°".replace("+", "+ "), mono_s, IVORY + (130,))
text((GX1, ty(NEW) + 18), f"{NEW:+.0f}°".replace("-", "− "), mono_s, MINT + (200,), "ra")
for s in range(0, int(T_END) + 1):
    text((tx(s), GY1 + 70), f"{s} s", mono_s, IVORY + (110,), "ma")
text((160, 3006), "aceleração = −k (θ − alvo) − c · velocidade", jura, IVORY + (190,))
text((160, 3052), "k 49   ·   c 3,5   ·   ω0 7 rad/s   ·   ζ 0,25   ·   período ≈ 0,9 s", font("Jura-Light.ttf", 21), IVORY + (130,))
text((2240, 3052), "a mão abre a pergunta · o repouso responde", mono_s, IVORY + (110,), "ra")

# conferência: nada se sobrepõe, tudo dentro da margem
M = 100 * S
over = [(a[1], b[1]) for i, a in enumerate(boxes) for b in boxes[i + 1:] if not (a[0][2] < b[0][0] or b[0][2] < a[0][0] or a[0][3] < b[0][1] or b[0][3] < a[0][1])]  # noqa: E501
out = [b[1] for b in boxes if b[0][0] < M or b[0][1] < M or b[0][2] > W * S - M or b[0][3] > H * S - M]
print("sobreposições:", over or "nenhuma", "| fora da margem:", out or "nenhum", f"| repouso {SETTLE:.2f}s")
img.resize((W, H), Image.LANCZOS).save("docs/design/toque-canvas.png", optimize=True)
