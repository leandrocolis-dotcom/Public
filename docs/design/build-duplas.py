# Gera docs/design/duplas-canvas.png ("Leme e Escada"): Carteira › Duplas L/S refeita em 27/11/2026.
# Coluna de celular: carteira das duplas → cartão com controles, postura, réguas com escada de travas e ordens.
# Valores de EXEMPLO (fictícios). Uso: python3 docs/design/build-duplas.py <pasta das fontes>
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "fonts"
S = 2
W, H = 760, 1440
M = 32  # margem
BG = (7, 10, 18)
SURF = (15, 21, 36)
SURF2 = (21, 28, 47)
LINE = (31, 42, 68)
TEXT = (232, 237, 248)
T2 = (154, 167, 194)
T3 = (121, 134, 163)
ACC = (140, 155, 255)
ACCD = (62, 70, 140)
INFO = (108, 180, 255)
INFOD = (38, 70, 112)
BUY = (61, 220, 151)
BUYD = (22, 84, 64)
SELL = (255, 112, 136)
SELLD = (92, 36, 50)

img = Image.new("RGB", (W * S, H * S), BG)
d = ImageDraw.Draw(img)


def f(name, size):
    return ImageFont.truetype(f"{FONTS}/{name}", size * S)


SERIF = lambda s: f("InstrumentSerif-Regular.ttf", s)  # noqa: E731
SANS = lambda s: f("InstrumentSans-Regular.ttf", s)  # noqa: E731
SANSB = lambda s: f("InstrumentSans-Bold.ttf", s)  # noqa: E731
MONO = lambda s: f("GeistMono-Regular.ttf", s)  # noqa: E731
MONOB = lambda s: f("GeistMono-Bold.ttf", s)  # noqa: E731


def t(x, y, s, font, fill=TEXT, anchor="la"):
    d.text((x * S, y * S), s, font=font, fill=fill, anchor=anchor)


def tw(s, font):
    return d.textlength(s, font=font) / S


def rr(x0, y0, x1, y1, r, fill=None, outline=None, w=1):
    d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), r * S, fill=fill, outline=outline, width=w * S)


def rect(x0, y0, x1, y1, fill):
    d.rectangle((x0 * S, y0 * S, x1 * S - 1, y1 * S - 1), fill=fill)


def hline(x0, x1, y, fill=LINE):
    rect(x0, y, x1, y + 1, fill)


def lab(x, y, s, fill=T3, anchor="la"):
    # versalete espaçado: rótulo minúsculo, nunca concorre com o número
    font = SANSB(10)
    s = s.upper()
    if anchor == "ra":
        x -= sum(tw(c, font) + 1.2 for c in s) - 1.2
    for c in s:
        t(x, y, c, font, fill)
        x += tw(c, font) + 1.2


def field(x, y, w, label, value, unit="%"):
    lab(x, y, label)
    rr(x, y + 16, x + w, y + 56, 8, fill=SURF2, outline=ACCD)
    t(x + w - 12, y + 26, unit, MONO(15), T3, "ra")
    t(x + w - 14 - tw(unit, MONO(15)), y + 24, value, MONOB(18), TEXT, "ra")


def price_bar(x0, x1, y, avg, now, stop):
    """Régua de preço da ponta: médio (fio), trava (entalhe acento), agora (agulha)."""
    pts = [avg, now] + ([stop] if stop else [])
    lo, hi = min(pts), max(pts)
    pad = (hi - lo) * 0.12 or now * 0.05
    lo, hi = lo - pad, hi + pad
    X = lambda p: x0 + (p - lo) / (hi - lo) * (x1 - x0)  # noqa: E731
    rr(x0, y, x1, y + 10, 5, fill=SURF2)
    if now >= avg:
        if stop:
            rect(X(avg), y, X(stop), y + 10, BUY)  # garantido
            rect(X(stop), y, X(now), y + 10, BUYD)  # ainda exposto
        else:
            rect(X(avg), y, X(now), y + 10, BUYD)
    else:
        rect(X(now), y, X(avg), y + 10, SELLD)
    rect(X(avg) - 0.5, y - 6, X(avg) + 1, y + 16, T2)  # médio
    t(X(avg), y + 20, f"médio {avg:.2f}", MONO(11), T3, "ma")
    if stop:
        sx = X(stop)
        d.polygon([((sx - 6) * S, (y - 10) * S), ((sx + 6) * S, (y - 10) * S), (sx * S, (y - 2) * S)], fill=ACC)
        rect(sx - 1, y - 2, sx + 1, y + 12, ACC)
        t(sx, y - 26, f"trava {stop:.2f}", MONOB(11), ACC, "ma")
    nx = X(now)
    rect(nx - 1.5, y - 8, nx + 1.5, y + 18, TEXT)  # agulha
    t(nx, y + 20, f"{now:.2f}", MONOB(11), TEXT, "ma")



def price_ladder(x0, x1, y, avg, now, stops):
    pts = [avg, now] + stops
    lo, hi = min(pts), max(pts)
    pad = (hi - lo) * 0.12
    lo, hi = lo - pad, hi + pad
    X = lambda p: x0 + (p - lo) / (hi - lo) * (x1 - x0)  # noqa: E731
    rr(x0, y, x1, y + 10, 5, fill=SURF2)
    if now >= avg:
        top = max(stops) if stops else avg
        rect(X(avg), y, X(top), y + 10, BUY)
        rect(X(top), y, X(now), y + 10, BUYD)
    else:
        rect(X(now), y, X(avg), y + 10, SELLD)
    rect(X(avg) - 0.5, y - 6, X(avg) + 1, y + 16, T2)
    t(X(avg), y + 22, f"médio {avg:.2f}", MONO(11), T3, "ma")
    for k, sp in enumerate(sorted(stops)):
        sx = X(sp)
        d.polygon([((sx - 6) * S, (y - 10) * S), ((sx + 6) * S, (y - 10) * S), (sx * S, (y - 2) * S)], fill=ACC)
        rect(sx - 1, y - 2, sx + 1, y + 12, ACC)
        t(sx, y - 26, f"{sp:.2f}", MONOB(11), ACC, "ma")
    nx = X(now)
    d.ellipse(((nx - 10) * S, (y - 5) * S, (nx + 10) * S, (y + 15) * S), fill=TEXT, outline=BG, width=3 * S)
    lbl = f"agora {now:.2f}"
    w = tw(lbl, MONOB(12)) + 16
    lx = min(max(nx - w / 2, x0 - 12), x1 + 12 - w)
    rr(lx, y + 20, lx + w, y + 40, 10, fill=TEXT)
    t(lx + w / 2, y + 23, lbl, MONOB(12), BG, "ma")


def posture(x0, x1, y, now, want):
    X = lambda v: x0 + (v + 1) / 2 * (x1 - x0)  # noqa: E731
    rr(x0, y, x1, y + 8, 4, fill=INFOD)
    rect(min(X(0), X(now)), y, max(X(0), X(now)), y + 8, INFO)
    rect(X(0) - 0.5, y - 4, X(0) + 0.5, y + 12, T3)
    if want is not None:
        wx = X(want)
        rect(wx - 1, y - 6, wx + 1, y + 14, ACC)
    t(x0, y + 16, "vendido", SANS(11), T3)
    t(x1, y + 16, "comprado", SANS(11), T3, "ra")


def ctrl(x, y, w, label, value):
    lab(x, y, label)
    rr(x, y + 16, x + w, y + 54, 8, fill=SURF2, outline=ACC)
    t(x + w - 12, y + 25, value, MONOB(17), TEXT, "ra")


# ── título ──
t(M, 34, "Duplas L/S", SERIF(34))
t(W - M, 46, "BTG 27/11 06:21 · ao vivo", MONO(11), T3, "ra")

# ── carteira das duplas ──
y = 92
rr(M, y, W - M, y + 330, 14, fill=SURF)
lab(M + 20, y + 18, "Carteira das duplas", ACC)
t(M + 20, y + 40, "+US$ 1.689", MONOB(38), BUY)
t(M + 20 + tw("+US$ 1.689", MONOB(38)) + 12, y + 56, "+19,6%", MONOB(18), BUY)
cols = [M + 20, M + 190, M + 360, M + 530]
for (lb, v, c), x in zip([("Comprado", "US$ 8.374", TEXT), ("Vendido", "US$ 80", TEXT), ("Líquido", "+US$ 24.3k", INFO), ("Caixa", "US$ 2.124", TEXT)], cols):
    lab(x, y + 104, lb)
    t(x, y + 122, v, MONOB(17), c)
t(cols[2], y + 146, "238% da conta", MONO(11), T3)
posture(M + 20, W - M - 20, y + 178, 0.97, None)
hline(M + 20, W - M - 20, y + 214)
lab(M + 20, y + 228, "Garantido pelas travas")
t(W - M - 20, y + 224, "+US$ 712", MONOB(17), ACC, "ra")
cx = M + 20
for lb, v in (("Base", "Médio"), ("Travas padrão", "50 %"), ("Custo", "0,10 %")):
    lab(cx, y + 262, lb)
    rr(cx, y + 278, cx + 190, y + 314, 8, fill=SURF2, outline=ACC)
    t(cx + 178, y + 286, v, MONOB(15), TEXT, "ra")
    cx += 213

t(M, 446, "PÊNDULO", SANSB(10), T3)
t(M + 70, 442, "+18", MONOB(16), INFO)
t(M + 108, 444, "Neutro", SANS(13), T2)
t(W - M, 445, "1 h ▲ 4", MONO(12), T3, "ra")

# ── cartão da dupla ──
y = 484
rr(M, y, W - M, H - 64, 14, fill=SURF)
t(M + 20, y + 22, "SOXL × SOXS", SANSB(18))
t(W - M - 20, y + 14, "+US$ 1.137", MONOB(26), BUY, "ra")
t(W - M - 20, y + 48, "+26,7%", MONO(12), BUY, "ra")
cy = y + 80
ctrl(M + 20, cy, 196, "Realizar", "25 %")
ctrl(M + 236, cy, 196, "Postura-alvo", "+60 %")
ctrl(M + 452, cy, 216, "Travas", "50 70 %")
lab(M + 20, cy + 82, "Postura")
t(W - M - 20, cy + 78, "+97% → +60%", MONOB(13), TEXT, "ra")
posture(M + 20, W - M - 20, cy + 102, 0.97, 0.6)
ly = cy + 150
for sym, lev, side, info, pl, plp, pc, avg, now, stops in (
    ("SOXL", "3x", "comprado", "147.59 · 28.56 → 36.31 · dia +11,4%", "+US$ 1.144", "+27,1%", BUY, 28.56, 36.31, [32.44, 33.99]),
    ("SOXS", "−3x", "vendido", "0.67 · 65.03 → 53.92 · dia −11,6%", "−US$ 7", "−17,1%", SELL, 65.03, 53.92, []),
):
    hline(M + 20, W - M - 20, ly)
    t(M + 20, ly + 14, sym, SANSB(16))
    t(M + 20 + tw(sym, SANSB(16)) + 8, ly + 17, f"{lev} · {side}", SANS(12), T3)
    t(W - M - 20, ly + 12, pl, MONOB(16), pc, "ra")
    t(M + 20, ly + 40, info, MONO(12), T2)
    t(W - M - 20, ly + 40, plp, MONO(12), pc, "ra")
    price_ladder(M + 50, W - M - 50, ly + 98, avg, now, stops)
    ly += 158
lab(M + 20, ly + 4, "Ordens")
oy = ly + 24
orders = [
    ("Inclinar: vender 50 SOXL", "→ +60% · realiza +US$ 386 · ou comprar 26 SOXS (US$ 1.402 do caixa)", None),
    ("Vender 36 SOXL", "US$ 1.307 · realiza +US$ 278", None),
    ("Stop 56 SOXL a 33,99", "degrau 70% · garante +US$ 304", ACC),
    ("Stop 55 SOXL a 32,44", "degrau 50% · garante +US$ 213", ACC),
]
for head_, sub, col in orders:
    rr(M + 20, oy, W - M - 20, oy + 50, 10, fill=SURF2, outline=ACCD if col else None)
    t(M + 36, oy + 8, head_, MONOB(15), col or TEXT)
    t(M + 36, oy + 29, sub, MONO(11), T2)
    oy += 58
rr(M + 20, oy + 4, W - M - 20, oy + 56, 10, outline=ACC)
lab(M + 36, oy + 23, "Travas executadas: fica com")
t(W - M - 36, oy + 18, "+US$ 788", MONOB(18), ACC, "ra")

t(W / 2, H - 30, "Leme e Escada · valores de exemplo", SANS(11), T3, "ma")
img.save("duplas-canvas.png", optimize=True)
print("ok", img.size)
