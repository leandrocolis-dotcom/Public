# Gera docs/design/duplas-canvas.png ("Instrumento Frio"): Carteira › Duplas L/S refeita em 27/11/2026.
# Coluna de celular: comandos no topo → regime (só leitura) → total → cartões com régua de preço e ordens prontas.
# Valores de EXEMPLO (fictícios). Uso: python3 docs/design/build-duplas.py <pasta das fontes>
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "fonts"
S = 2
W, H = 760, 1690
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


# ── título ──
t(M, 34, "Duplas L/S", SERIF(34))
t(W - M, 46, "BTG 27/11 06:21 · preços ao vivo", MONO(11), T3, "ra")

# ── comandos ──
y = 92
rr(M, y, W - M, y + 250, 14, fill=SURF)
lab(M + 20, y + 18, "Comandos", ACC)
seg_x = W - M - 20 - 236
rr(seg_x, y + 12, seg_x + 236, y + 44, 8, fill=SURF2)
rr(seg_x + 3, y + 15, seg_x + 125, y + 41, 6, fill=ACCD)
t(seg_x + 64, y + 21, "Desde o médio", SANSB(12), TEXT, "ma")
t(seg_x + 181, y + 21, "Hoje", SANS(12), T2, "ma")
cy = y + 62
cols = [M + 20, M + 240, M + 440]
for name in ("SOXL × SOXS", "SNDU × SNDQ"):
    t(cols[0], cy + 30, name, SANSB(16))
    field(cols[1], cy, 172, "Vender", "30")
    field(cols[2], cy, 236, "Reter do lucro", "50")
    cy += 76
hline(M + 20, W - M - 20, cy - 4)
t(M + 20, cy + 10, "Custo por operação", SANS(13), T2)
t(W - M - 20, cy + 8, "0,10 %", MONOB(15), TEXT, "ra")

# ── regime (só leitura) ──
y = 362
t(M, y, "PÊNDULO", SANSB(10), T3)
t(M + 70, y - 4, "+18", MONOB(17), INFO)
t(M + 112, y - 2, "Neutro, puxando para risco", SANS(14), T2)
t(W - M, y - 1, "1 h ▲ 4", MONO(13), T3, "ra")
hline(M, W - M, y + 30)

# ── total ──
y = 414
lab(M, y, "Total das duplas")
t(M, y + 22, "+US$ 1.842", MONOB(40), BUY)
t(M + tw("+US$ 1.842", MONOB(40)) + 12, y + 40, "+21,4%", MONOB(20), BUY)
lab(M, y + 92, "Comprado")
t(M, y + 110, "US$ 8.545", MONOB(20))
lab(M + 220, y + 92, "Vendido")
t(M + 220, y + 110, "US$ 78", MONOB(20))
lab(W - M, y + 92, "Investido", anchor="ra")
t(W - M, y + 110, "US$ 7.516", MONO(20), T2, "ra")
by = y + 150
rr(M, by, W - M, by + 8, 4, fill=INFOD)
rr(M, by, M + (W - 2 * M) * 0.99, by + 8, 4, fill=INFO)

# ── cartões ──
legs_card = [
    ("SOXL × SOXS", "+US$ 1.367", "+32,1%", BUY, [
        ("SOXL", "3x", "comprado", 147.59, 28.56, 37.41, "+4,8%", "+US$ 1.306", "+31,0%", BUY, 32.99),
        ("SOXS", "−3x", "vendido", 0.67, 65.03, 51.74, "−4,6%", "−US$ 9", "−20,4%", SELL, None),
    ], ("Vender 44 SOXL", "US$ 1.646 · realiza +US$ 389"), ("Stop SOXL a 32,99", "103 cotas · −11,8% · garante +US$ 455")),
    ("SNDU × SNDQ", "+US$ 554", "+22,1%", BUY, [
        ("SNDU", "2x", "comprado", 1140.99, 2.15, 2.65, "+3,1%", "+US$ 571", "+23,3%", BUY, 2.40),
        ("SNDQ", "−2x", "vendido", 1.09, 55.28, 39.71, "−3,0%", "−US$ 17", "−28,2%", SELL, None),
    ], ("Vender 342 SNDU", "US$ 906 · realiza +US$ 171"), ("Stop SNDU a 2,40", "799 cotas · −9,4% · garante +US$ 200")),
]
y = 600
for name, res, rp, col, legs, sell, stop in legs_card:
    h = 504
    rr(M, y, W - M, y + h, 14, fill=SURF)
    t(M + 20, y + 22, name, SANSB(18))
    t(W - M - 20, y + 14, res, MONOB(26), col, "ra")
    t(W - M - 20, y + 48, rp + " sobre o investido", MONO(12), col, "ra")
    ly = y + 84
    for sym, lev, side, qty, avg, now, day, pl, plp, pc, stp in legs:
        hline(M + 20, W - M - 20, ly)
        t(M + 20, ly + 14, sym, SANSB(16))
        t(M + 20 + tw(sym, SANSB(16)) + 8, ly + 17, f"{lev} · {side}", SANS(12), T3)
        t(W - M - 20, ly + 12, pl, MONOB(16), pc, "ra")
        q = f"{qty:,.2f}".replace(",", " ")
        t(M + 20, ly + 40, f"{q} cotas · {avg:.2f} → {now:.2f} · dia {day}", MONO(12), T2)
        t(W - M - 20, ly + 40, plp, MONO(12), pc, "ra")
        price_bar(M + 50, W - M - 50, ly + 92, avg, now, stp)
        ly += 140
    oy = ly + 8
    for (head, sub), kind in ((sell, "sell"), (stop, "stop")):
        rr(M + 20, oy, W - M - 20, oy + 52, 10, fill=SURF2, outline=ACCD if kind == "stop" else None)
        t(M + 36, oy + 9, head, MONOB(16), ACC if kind == "stop" else TEXT)
        t(M + 36, oy + 31, sub, MONO(11), T2)
        t(W - M - 36, oy + 17, "trava" if kind == "stop" else "venda", SANSB(10), T3, "ra")
        oy += 60
    y += h + 20

t(W / 2, H - 28, "Instrumento Frio · valores de exemplo", SANS(11), T3, "ma")
img.save("duplas-canvas.png", optimize=True)
print("ok", img.size)
