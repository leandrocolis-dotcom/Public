# Gera docs/design/duplas-canvas.png ("Fiel da Balança"): Carteira › Duplas L/S redesenhada.
# Faixa de comando + dois cartões (um pede ajuste, outro bateu o alvo). Valores de EXEMPLO (fictícios).
# Uso: python3 docs/design/build-duplas.py <pasta das fontes>
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "fonts"
S = 2
W, H = 2400, 1960
BG = (7, 10, 18)
SURF = (15, 21, 36)
SURF2 = (21, 28, 47)
LINE = (31, 42, 68)
LINE2 = (45, 59, 94)
TEXT = (232, 237, 248)
T2 = (154, 167, 194)
T3 = (121, 134, 163)
ACC = (140, 155, 255)
ACCS = (27, 34, 80)
INFO = (108, 180, 255)
INFOD = (38, 70, 112)
BUY = (61, 220, 151)
BUYS = (14, 43, 38)
SELL = (255, 112, 136)
WARN = (255, 196, 92)
WARNS = (51, 38, 14)

img = Image.new("RGB", (W * S, H * S), BG)
d = ImageDraw.Draw(img)


def f(name, size):
    return ImageFont.truetype(f"{FONTS}/{name}", size * S)


SERIF = lambda s: f("InstrumentSerif-Regular.ttf", s)  # noqa: E731
SANS = lambda s: f("InstrumentSans-Regular.ttf", s)  # noqa: E731
SANSB = lambda s: f("InstrumentSans-Bold.ttf", s)  # noqa: E731
MONO = lambda s: f("GeistMono-Regular.ttf", s)  # noqa: E731
MONOB = lambda s: f("GeistMono-Bold.ttf", s)  # noqa: E731


def t(x, y, s, font, fill=TEXT, anchor="la", spacing=0):
    if spacing:
        for ch in s:
            d.text((x * S, y * S), ch, font=font, fill=fill, anchor=anchor)
            x += d.textlength(ch, font=font) / S + spacing
        return x
    d.text((x * S, y * S), s, font=font, fill=fill, anchor=anchor)
    return x + d.textlength(s, font=font) / S


def tw(s, font):
    return d.textlength(s, font=font) / S


def rr(x0, y0, x1, y1, r, fill=None, outline=None, w=1):
    d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), r * S, fill=fill, outline=outline, width=w * S)


def rect(x0, y0, x1, y1, fill):
    d.rectangle((x0 * S, y0 * S, x1 * S, y1 * S), fill=fill)


def line(x0, y0, x1, y1, fill=LINE, w=1):
    d.line((x0 * S, y0 * S, x1 * S, y1 * S), fill=fill, width=w * S)


def lab(x, y, s, fill=T3):
    return t(x, y, s.upper(), SANSB(15), fill, spacing=2.2)


def balance(x0, x1, y, h, tilt, want, band=0.1, small=False):
    """Barra comprado | vendido: a divisão é a agulha; marca do alvo e faixa da folga."""
    wpx = x1 - x0
    pos = lambda v: x0 + (1 + v) / 2 * wpx  # noqa: E731
    split = pos(tilt)
    rr(x0, y, x1, y + h, h / 2, fill=INFOD)
    # comprado (cheio) à esquerda até a agulha
    d.rounded_rectangle((x0 * S, y * S, split * S, (y + h) * S), int(h / 2 * S), fill=INFO)
    rect(split - h / 2, y, split, y + h, INFO)
    # folga do alvo
    b0, b1 = pos(max(-1, want - band)), pos(min(1, want + band))
    rr(b0, y - 8, b1, y + h + 8, 6, outline=ACC, w=1)
    # alvo
    tx = pos(want)
    line(tx, y - 16, tx, y + h + 16, ACC, 3)
    # agulha
    line(split, y - 22, split, y + h + 22, TEXT, 2)
    d.ellipse(((split - 6) * S, (y - 30) * S, (split + 6) * S, (y - 18) * S), fill=TEXT)
    # zero
    zx = pos(0)
    line(zx, y + h + 4, zx, y + h + 12, T3, 1)


def ruler(x0, x1, y, frac, lock=None, hit=False):
    """Régua 0 → alvo (ou 0 → reserva): preenchimento e marca da trava."""
    h = 14
    rr(x0, y, x1, y + h, h / 2, fill=SURF2)
    fx = x0 + max(0.0, min(1.0, frac)) * (x1 - x0)
    if fx > x0 + h:
        rr(x0, y, fx, y + h, h / 2, fill=BUY if hit else INFO)
    if lock is not None:
        lx = x0 + lock * (x1 - x0)
        line(lx, y - 8, lx, y + h + 8, TEXT, 2)


M = 160
# ── título ──
t(M, 128, "Fiel da Balança", SERIF(84))
t(M, 228, "Carteira › Duplas L/S · a postura antes do número, a ordem pronta antes da explicação", SANS(26), T2)
line(M, 290, W - M, 290)

# ── faixa de comando ──
CY0, CY1 = 330, 560
rr(M, CY0, W - M, CY1, 22, fill=SURF, outline=LINE)
cols = [M + 40, M + 470, M + 1180, M + 1680]
# pêndulo
lab(cols[0], CY0 + 36, "Pêndulo · 1 dia")
t(cols[0], CY0 + 70, "+32", MONOB(64))
t(cols[0] + 130, CY0 + 88, "risco moderado", SANS(22), T2)
t(cols[0] + 130, CY0 + 120, "1 h  ▲ 6", MONO(20), T2)
line(cols[1] - 40, CY0 + 30, cols[1] - 40, CY1 - 30)
# total das duplas
lab(cols[1], CY0 + 36, "Total das duplas")
balance(cols[1], cols[2] - 90, CY0 + 104, 26, 0.12, 0.16, small=True)
t(cols[1], CY0 + 160, "56% comprado", SANS(20), T2)
t(cols[2] - 90, CY0 + 160, "44% vendido", SANS(20), T2, anchor="ra")
t((cols[1] + cols[2] - 90) / 2, CY0 + 160, "+12% → alvo +16%", MONO(20), TEXT, anchor="ma")
line(cols[2] - 40, CY0 + 30, cols[2] - 40, CY1 - 30)
# caixa
lab(cols[2], CY0 + 36, "Caixa × reserva")
t(cols[2], CY0 + 70, "US$ 6,200", MONOB(40))
ruler(cols[2], cols[3] - 90, CY0 + 136, 1.0, lock=4800 / 6200)
t(cols[2], CY0 + 166, "reserva US$ 4,800 · livre US$ 1,400", SANS(19), T2)
line(cols[3] - 40, CY0 + 30, cols[3] - 40, CY1 - 30)
# status
rr(cols[3], CY0 + 40, W - M - 40, CY1 - 40, 16, fill=WARNS, outline=WARN)
t(cols[3] + 28, CY0 + 70, "1 dupla", SANSB(34), WARN)
t(cols[3] + 28, CY0 + 116, "pede ajuste", SANS(24), WARN)
t(cols[3] + 28, CY0 + 152, "conta US$ 48,000", MONO(18), T2)


def card(x0, x1, y0, data):
    y1 = y0 + 1240
    rr(x0, y0, x1, y1, 22, fill=SURF, outline=LINE)
    p = 44
    L, R = x0 + p, x1 - p
    # cabeçalho
    t(L, y0 + 40, data["name"], SANSB(36))
    if data.get("badge"):
        bw = tw(data["badge"], SANSB(17)) + 28
        bx = L + tw(data["name"], SANSB(36)) + 22
        rr(bx, y0 + 46, bx + bw, y0 + 80, 17, fill=WARNS, outline=WARN)
        t(bx + 14, y0 + 53, data["badge"], SANSB(17), WARN)
    t(R, y0 + 30, data["pl"], MONOB(52), BUY, anchor="ra")
    t(R, y0 + 96, data["plsub"], SANS(19), T2, anchor="ra")
    # postura
    y = y0 + 160
    lab(L, y, "Postura")
    balance(L, R, y + 64, 34, data["tilt"], data["want"])
    t(L, y + 128, data["long"], SANS(21), TEXT)
    t(R, y + 128, data["short"], SANS(21), T2, anchor="ra")
    t((L + R) / 2, y + 128, data["tiltTxt"], MONO(21), TEXT, anchor="ma")
    # próxima ação
    y = y0 + 360
    lab(L, y, "Próxima ação")
    a = data["act"]
    fill, out, col = (ACCS, ACC, TEXT) if a["kind"] == "move" else (BUYS, BUY, BUY)
    rr(L, y + 36, R, y + 190, 16, fill=fill, outline=out, w=2)
    tx0 = L + 28
    if a.get("star"):
        import math
        cx_, cy_, ro, ri = tx0 + 14, y + 84, 14, 6
        pts = [(cx_ + (ro if k % 2 == 0 else ri) * math.sin(k * math.pi / 5), cy_ - (ro if k % 2 == 0 else ri) * math.cos(k * math.pi / 5)) for k in range(10)]
        d.polygon([(px * S, py * S) for px, py in pts], fill=ACC)
        tx0 += 40
    t(tx0, y + 62, a["title"], SANSB(36), col)
    t(R - 28, y + 62, a["value"], MONOB(34), TEXT, anchor="ra")
    t(L + 28, y + 122, a["sub"], SANS(22), T2)
    t(L, y + 214, a["alt"], SANS(19), T3)
    # alvo de saída
    y = y0 + 640
    lab(L, y, data["goalLab"])
    t(R, y - 4, data["goalTxt"], MONO(20), TEXT, anchor="ra")
    ruler(L, R, y + 44, data["goalFrac"], lock=data["lock"], hit=data["goalFrac"] >= 1)
    t(L, y + 76, "0", MONO(16), T3)
    lx = L + data["lock"] * (R - L)
    t(lx, y + 76, "trava", SANS(16), T2, anchor="ma")
    t(R, y + 76, "alvo", SANS(16), T2, anchor="ra")
    # ordens na corretora
    y = y0 + 780
    lab(L, y, "Ordens na corretora")
    cx = [L, L + 170, L + 380, L + 680]
    for c, h in zip(cx, ["Ponta", "Agora", "Alvo · limitada ↑", "Trava · stop ↓"]):
        t(c, y + 40, h, SANS(17), T3)
    for i, row in enumerate(data["orders"]):
        ry = y + 76 + i * 64
        line(L, ry - 8, R, ry - 8)
        t(cx[0], ry + 6, row[0], SANSB(24))
        t(cx[1], ry + 6, row[1], MONO(24), T2)
        t(cx[2], ry, row[2], MONOB(30))
        t(cx[2] + tw(row[2], MONOB(30)) + 12, ry + 10, row[3], MONO(17), T2)
        t(cx[3], ry, row[4], MONOB(30))
        t(cx[3] + tw(row[4], MONOB(30)) + 12, ry + 10, row[5], MONO(17), T2)
    # pontas
    y = y0 + 1000
    lab(L, y, "Pontas")
    for i, row in enumerate(data["legs"]):
        ry = y + 40 + i * 52
        t(L, ry, row[0], SANSB(22))
        t(L + 100, ry + 3, row[1], MONO(17), T3)
        t(L + 180, ry, row[2], MONO(21), T2)
        t(L + 330, ry, row[3], MONO(21), T2)
        t(R - 190, ry, row[4], MONO(21), BUY if row[4].startswith("+") else SELL, anchor="ra")
        t(R, ry, row[5], MONOB(21), BUY if row[5].startswith("+") else SELL, anchor="ra")
    line(L, y1 - 70, R, y1 - 70)
    t(L, y1 - 50, data["foot"], SANS(17), T3)


GAP = 40
CW = (W - 2 * M - GAP) / 2
card(
    M,
    M + CW,
    620,
    {
        "name": "SOXL × SOXS",
        "badge": "FORA DA FOLGA",
        "pl": "+US$ 412",
        "plsub": "+3.1% desde o médio",
        "tilt": 0.24,
        "want": 0.40,
        "long": "62% comprado",
        "short": "38% vendido",
        "tiltTxt": "+24% → alvo +40%",
        "act": {
            "kind": "move",
            "title": "Vender 14 SOXS", "star": True,
            "value": "US$ 1,512",
            "sub": "realiza +US$ 96 · leva a dupla a +40%",
            "alt": "ou Comprar 9 SOXL · usa US$ 1,380 do caixa livre",
        },
        "goalLab": "Alvo de saída · 1.0% da conta",
        "goalTxt": "US$ 412 de US$ 480",
        "goalFrac": 412 / 480,
        "lock": 0.5,
        "orders": [
            ["SOXL", "41.10", "42.86", "+4.3%", "38.94", "−5.3%"],
            ["SOXS", "10.80", "10.34", "−4.3%", "11.37", "+5.3%"],
        ],
        "legs": [
            ["SOXL", "+3x", "120 cotas", "38.20 → 41.10", "+7.6%", "+US$ 348"],
            ["SOXS", "−3x", "180 cotas", "10.44 → 10.80", "+3.4%", "+US$ 64"],
        ],
        "foot": "alvo %  1.0   ·   inclinação  regime        lápis edita as quantidades",
    },
)
card(
    M + CW + GAP,
    W - M,
    620,
    {
        "name": "UVIX × SVIX",
        "pl": "+US$ 655",
        "plsub": "+5.4% desde o médio",
        "tilt": -0.18,
        "want": -0.12,
        "long": "41% comprado",
        "short": "59% vendido",
        "tiltTxt": "−18% → alvo −12% · na folga",
        "act": {
            "kind": "hit",
            "title": "Alvo batido · Vender 30 SVIX",
            "value": "US$ 1,236",
            "sub": "embolsa +US$ 610 líquido · caixa vai a US$ 7,430",
            "alt": "inclinação na folga: nada a ajustar",
        },
        "goalLab": "Alvo de saída · 1.2% da conta",
        "goalTxt": "US$ 655 de US$ 576 · batido",
        "goalFrac": 1.0,
        "lock": 0.5,
        "orders": [
            ["UVIX", "7.62", "7.18", "−5.8%", "8.04", "+5.5%"],
            ["SVIX", "41.20", "43.60", "+5.8%", "38.98", "−5.4%"],
        ],
        "legs": [
            ["UVIX", "−2x", "400 cotas", "8.10 → 7.62", "−5.9%", "−US$ 192"],
            ["SVIX", "+1x", "260 cotas", "37.94 → 41.20", "+8.6%", "+US$ 847"],
        ],
        "foot": "alvo %  1.2   ·   inclinação  −12 (manual)        lápis edita as quantidades",
    },
)

# rodapé
line(M, H - 92, W - M, H - 92)
t(M, H - 68, "o ponto da divisão é a agulha · a marca é o alvo · a moldura é a folga", SANS(18), T3)
t(W - M, H - 68, "valores de exemplo · material educacional", SANS(18), T3, anchor="ra")

img.save(sys.argv[2] if len(sys.argv) > 2 else "docs/design/duplas-canvas.png", optimize=True)
