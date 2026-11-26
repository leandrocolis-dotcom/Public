# Gera docs/design/carteira-topo-canvas.png ("Ordem de Leitura"): o topo da Carteira › Posições antes e depois.
# Antes: nove números do mesmo tamanho. Depois: herói → régua Brasil × exterior → dois cartões → faixa do pregão.
# Valores de EXEMPLO (fictícios). Uso: python3 docs/design/build-carteira-topo.py <pasta das fontes>
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "fonts"
S = 2
W, H = 2400, 1800
BG = (7, 10, 18)
SURF = (15, 21, 36)
LINE = (31, 42, 68)
TEXT = (232, 237, 248)
T2 = (154, 167, 194)
T3 = (121, 134, 163)
ACC = (140, 155, 255)
INFO = (108, 180, 255)
BUY = (61, 220, 151)
SELL = (255, 112, 136)

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


def rr(x0, y0, x1, y1, r, fill=None, outline=None, w=1):
    d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), r * S, fill=fill, outline=outline, width=w * S)


def lab(x, y, s, fill=T2):
    return t(x, y, s.upper(), SANSB(17), fill, spacing=2.2)


M = 160
# título
t(M, 150, "Ordem de Leitura", SERIF(84))
t(M, 250, "Carteira › Posições · o topo lido de cima para baixo, uma vez só", SANS(26), T2)
d.line((M * S, 310 * S, (W - M) * S, 310 * S), fill=LINE, width=S)

# ── ANTES: nove números iguais ──
AX, AY, AW = M, 400, 820
lab(AX, AY, "Antes · 9 números do mesmo tamanho", T3)
cells = [
    ("Patrimônio total", "R$ 100,000", None),
    ("Brasil", "R$ 40,000", BUY),
    ("Internacional", "US$ 10,000", None),
    ("Resultado internacional", "+5.00%", BUY),
    ("Hoje · internacional", "+1.00%", BUY),
    ("", "", None),
    ("Pregão NY", "abre em 6h47", None),
    ("Pós", "+0.50%", BUY),
    ("Desde a foto anterior", "−1.00%", SELL),
    ("Em 16 fotos", "−2.00%", SELL),
]
cy = AY + 60
i = 0
for labl, val, col in cells:
    if not labl:
        i += 1 if i % 2 else 0
        continue
    cx = AX + (i % 2) * (AW // 2)
    yy = cy + (i // 2) * 140
    t(cx, yy, labl.upper(), SANSB(15), T3)
    t(cx, yy + 30, val, MONOB(40), col or TEXT)
    t(cx, yy + 86, "· · · · · · · ·", MONO(16), LINE)
    i += 1
# marcas do problema
yy = cy + 5 * 140 + 30
for k, s in enumerate(["sem ordem: tudo grita igual", "R$ e US$ misturados", "relógio do pregão como métrica", "“ao vivo” com a bolsa fechada", "“fotos”: jargão da coleta", "textos cortados com …"]):
    t(AX, yy + k * 44, "×", MONOB(22), SELL)
    t(AX + 34, yy + k * 44 + 2, s, SANS(24), T2)

# ── DEPOIS: telefone ──
PX, PY, PW, PH = 1180, 380, 1060, 1200
rr(PX, PY, PX + PW, PY + PH, 56, fill=SURF, outline=LINE, w=2)
x0 = PX + 70
x1 = PX + PW - 70
y = PY + 80
lab(x0, y, "Depois")
# 1 herói
y += 60
lab(x0, y, "Patrimônio")
t(x0, y + 34, "R$ 100,000", MONOB(96))
yy = y + 160
xx = t(x0, yy, "−1.00%", MONOB(28), SELL)
xx = t(xx + 14, yy + 2, "desde 24/11", SANS(26), T2)
xx = t(xx + 22, yy, "·", SANS(26), T3)
xx = t(xx + 22, yy, "−2.00%", MONOB(28), SELL)
t(xx + 14, yy + 2, "desde 22/11", SANS(26), T2)
# 2 régua
y = yy + 80
split = 0.40
mid = x0 + (x1 - x0) * split
rr(x0, y, mid - 3, y + 16, 8, fill=ACC)
rr(mid + 3, y, x1, y + 16, 8, fill=INFO)
# 3 dois cartões
y += 56
cw = (x1 - x0 - 30) / 2
for k, (nm, w, col, val, sub1, sub1c, sub2) in enumerate([
    ("Brasil", "40%", ACC, "R$ 40,000", "+R$ 10", BUY, "rendimento · 3 de 5"),
    ("Exterior", "60%", INFO, "US$ 10,000", "+5.00%", BUY, "s/ custo · R$ 50,000"),
]):
    cx = x0 + k * (cw + 30)
    rr(cx, y, cx + cw, y + 220, 28, outline=LINE, w=2)
    d.ellipse(((cx + 34) * S, (y + 42) * S, (cx + 48) * S, (y + 56) * S), fill=col)
    xx = lab(cx + 62, y + 38, nm)
    t(xx + 10, y + 36, w, MONO(20), T3)
    t(cx + 34, y + 84, val, MONOB(50))
    xx = t(cx + 34, y + 160, sub1, MONOB(24), sub1c)
    t(xx + 10, y + 162, sub2, SANS(22), T2)
# 4 faixa do pregão
y += 280
d.line((x0 * S, y * S, x1 * S, y * S), fill=LINE, width=S)
y += 40
lab(x0, y, "Exterior hoje")
t(x1, y - 2, "abre em 6h47", SANS(22), T3, anchor="ra")
y += 50
sw = (x1 - x0) / 2
for k, (nm, val, sub) in enumerate([("Último pregão", "+1.00%", "+US$ 100"), ("Pós · 21:59", "+0.50%", "+US$ 50 · 7/7")]):
    cx = x0 + k * sw
    t(cx, y, nm, SANS(22), T2)
    t(cx, y + 36, val, MONOB(44), BUY)
    t(cx, y + 98, sub, MONO(20), T3)
# números de leitura
y += 190
d.line((x0 * S, y * S, x1 * S, y * S), fill=LINE, width=S)
for k, s in enumerate(["1  quanto tenho", "2  onde está", "3  como cada lado vai", "4  o que muda agora"]):
    t(x0 + (k % 2) * sw, y + 40 + (k // 2) * 46, s, MONO(22), ACC if k == 0 else T2)

t(M, H - 110, "Prumo Noturno · uma cor = um sentido · verde só em variação · sem reticências", MONO(20), T3)
img = img.resize((W, H), Image.LANCZOS)
img.save("docs/design/carteira-topo-canvas.png", optimize=True)
print("ok")
