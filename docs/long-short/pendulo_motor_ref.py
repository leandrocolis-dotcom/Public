"""Implementação de referência do motor do Pêndulo (schema v4).

Não é o app: serve para o app ser conferido contra ela.
Roda os testes obrigatórios da especificação: python3 pendulo_motor_ref.py
"""
import json
import math
import random
import sys
from pathlib import Path

REGRAS = json.loads((Path(__file__).parent / "pendulo-regras.json").read_text(encoding="utf-8"))
PAR = REGRAS["parametros"]


class DadoInvalido(Exception):
    """Dispara EXE-01: nenhuma quantidade é gerada."""


def lado(acao, dir_):
    tabela = REGRAS["motor"]["lado_ordem"]
    return tabela[acao]["+1" if dir_ == 1 else "-1"]


def r_valor(capital):
    if capital <= 0:
        raise DadoInvalido("capital")
    return capital * PAR["risco_por_ponta_pct_capital"] / 100


def dist_stop(P, L, atr_intra, S):
    if min(P, L, atr_intra, S) <= 0:
        raise DadoInvalido("P/L/ATR/S")
    return P * L * PAR["stop_inicial_atr_intraday"] * atr_intra / S


def exposicao(q, P, L, tipo, dir_):
    return q * P * L * tipo * dir_


def stop_vigente(stop_atual, P, d, dir_):
    calc = P - dir_ * d
    if stop_atual is None:
        return calc
    return max(stop_atual, calc) if dir_ == 1 else min(stop_atual, calc)


def devolucao_pct(hwm, P, pm, dir_):
    base = dir_ * (hwm - pm)
    if base <= 0:
        return None
    return dir_ * (hwm - P) / base * 100


def qtd_reducao(q, f, prioridade):
    if q <= 0:
        return 0
    if q == 1:
        return 1 if prioridade in ("P2", "P3", "P4") else 0
    return min(q, max(1, math.floor(q * f)))


def q_limite_exposicao(exp_liq, exp_bruta, unit_liq, capital):
    """Maior q inteiro com |exp_liq + q*unit| <= 1,5*cap e bruta + q*|unit| <= 2*cap."""
    lim_l = PAR["exposicao_liquida_max_x_capital"] * capital
    lim_b = PAR["exposicao_bruta_max_x_capital"] * capital
    a = abs(unit_liq)
    if a == 0:
        return 10**9
    q_b = (lim_b - exp_bruta) / a
    q_l = (lim_l - exp_liq) / unit_liq if unit_liq > 0 else (lim_l + exp_liq) / a
    return max(0, math.floor(min(q_b, q_l) + 1e-9))


def q_entrada(capital, P, L, tipo, dir_, atr, S, exp_liq, exp_bruta, risco_total, teto, sessao="REGULAR"):
    R = r_valor(capital)
    d = dist_stop(P, L, atr, S)
    r_sess = R * (PAR["pre_tamanho_mult"] if sessao == "PRE" else 1)
    conc = PAR["concentracao_max_pct_capital"] / 100 * capital
    unit = P * L * tipo * dir_
    q = min(r_sess / d, conc / P, q_limite_exposicao(exp_liq, exp_bruta, unit, capital), max(0, teto - risco_total) / d)
    return max(0, math.floor(q + 1e-9)), round(P - dir_ * d, 2)


def q_pyramiding(capital, q, pm, stop_atual, ultimo_lote, P, L, tipo, dir_, atr, S, exp_liq, exp_bruta, risco_total, teto):
    R = r_valor(capital)
    d = dist_stop(P, L, atr, S)
    s = P - dir_ * d
    risco_atual = max(0.0, dir_ * (pm - stop_atual) * q)
    conc = PAR["concentracao_max_pct_capital"] / 100 * capital
    unit = P * L * tipo * dir_
    lims = {
        "risco": (R - risco_atual) / d,
        "lote": PAR["pyramiding_lote_max_vs_anterior"] * ultimo_lote,
        "concentracao": (conc - q * P) / P,
        "exposicao": q_limite_exposicao(exp_liq, exp_bruta, unit, capital),
        "teto_risco": max(0, teto - risco_total) / d,
    }
    trava = min(lims, key=lims.get)
    return max(0, math.floor(lims[trava] + 1e-9)), round(s, 2), trava


FINALIDADE_REDUCAO = {"REDUZIR", "ZERAR"}


def ordem_bloqueada(finalidade, travas_compra_ativas):
    """Bloqueios valem pela finalidade, nunca pelo lado (cobertura de short é compra que reduz risco)."""
    if finalidade in FINALIDADE_REDUCAO:
        return False
    return bool(travas_compra_ativas)


def desvio_direcional(pontas, capital, planejado_x):
    """pontas: lista de (exposicao_ajustada, beta). Retorna (efetivo_x, bloqueia)."""
    efetivo = sum(e * b for e, b in pontas) / capital
    return round(efetivo, 4), abs(efetivo - planejado_x) > PAR["desvio_direcional_max_x_capital"]


def aluguel(valor_vendido, taxa_aa, dias, base=None):
    return valor_vendido * taxa_aa * dias / (base or PAR["aluguel_base_dias"])


def alerta_evento_corporativo(ret_etf, ret_subj, L, tipo):
    """Heurística: só alerta. Nunca altera a carteira."""
    return abs(ret_etf - L * tipo * ret_subj) * 100 > PAR["etf_divergencia_alerta_pp"]


class LivroDeRegistros:
    """Ciclo de vida manual das ordens + idempotência por id único."""
    ESTADOS_FINAIS = {"EXECUTADA", "CANCELADA", "REJEITADA", "EXPIRADA"}

    def __init__(self):
        self.posicao, self.aplicados, self.ordens = 0, set(), {}

    def sugerir(self, oid, finalidade, qtd):
        self.ordens[oid] = {"finalidade": finalidade, "qtd": qtd, "exec": 0, "status": "SUGERIDA"}

    def registrar_execucao(self, reg_id, oid, qtd, sinal):
        if reg_id in self.aplicados:
            return False
        self.aplicados.add(reg_id)
        o = self.ordens[oid]
        o["exec"] += qtd
        self.posicao += sinal * qtd
        o["status"] = "EXECUTADA" if o["exec"] >= o["qtd"] else "PARCIAL"
        return True

    def encerrar_saldo(self, oid, status):
        assert status in {"CANCELADA", "REJEITADA", "EXPIRADA"}
        self.ordens[oid]["status"] = status

    def bloqueia_mesma_finalidade(self, finalidade):
        return any(o["finalidade"] == finalidade and o["status"] not in self.ESTADOS_FINAIS
                   and o["status"] != "SUGERIDA" for o in self.ordens.values())


def testes_revisao_2():
    # cobertura de short liberada com compras suspensas
    assert ordem_bloqueada("ZERAR", ["RSK-04"]) is False
    assert ordem_bloqueada("REDUZIR", ["P0"]) is False
    assert ordem_bloqueada("AUMENTAR", ["RSK-04"]) is True
    # desvio direcional (exemplo do revisor)
    ef, bloq = desvio_direcional([(10000, 1.5), (-10000, 0.5)], 25000, 0.0)
    assert ef == 0.4 and bloq
    assert desvio_direcional([(10000, 1.0), (-10000, 1.0)], 25000, 0.0) == (0.0, False)
    # aluguel
    assert round(aluguel(20000, 0.12, 10), 2) == 66.67
    assert round(aluguel(20000, 0.12, 10, 365), 2) == 65.75
    # evento corporativo: alerta, carteira intacta
    assert alerta_evento_corporativo(-0.45, -0.05, 3, 1) is True
    assert alerta_evento_corporativo(-0.15, -0.05, 3, 1) is False
    # split 3:2 (preço -33%) com subjacente parado: agora detectado
    assert alerta_evento_corporativo(-1 / 3, 0.0, 3, 1) is True
    # ciclo de vida e idempotência
    lv = LivroDeRegistros()
    lv.sugerir("o1", "REDUZIR", 100)
    assert lv.registrar_execucao("r1", "o1", 40, -1) is True
    assert lv.registrar_execucao("r1", "o1", 40, -1) is False   # duplicado ignorado
    assert lv.posicao == -40 and lv.ordens["o1"]["status"] == "PARCIAL"
    assert lv.bloqueia_mesma_finalidade("REDUZIR") is True
    lv.encerrar_saldo("o1", "CANCELADA")
    assert lv.bloqueia_mesma_finalidade("REDUZIR") is False


def teste_exemplo():
    t = REGRAS["teste_exemplo"]
    i, e = t["insumos"], t["esperado"]
    cap = i["capital"]
    R = r_valor(cap)
    teto = PAR["teto_risco_r"] * R
    a, b = i["SOXL"], i["SQQQ"]
    qL, stL = q_entrada(cap, a["P"], 3, 1, 1, a["atr_intra"], a["S"], 0, 0, 0, teto)
    eL = exposicao(qL, a["P"], 3, 1, 1)
    rL0 = qL * (a["P"] - stL)
    qS, stS = q_entrada(cap, b["P"], 3, -1, 1, b["atr_intra"], b["S"], eL, abs(eL), rL0, teto)
    P1, P2 = i["depois"]["SOXL_P"], i["depois"]["SQQQ_P"]
    rS = round((P2 - b["P"]) * qS / R, 2)
    f = 1 / 3 if rS > PAR["reducao_ponta_perdedora_limiar_r"] else 1 / 2
    vend = qtd_reducao(qS, f, "P3")
    qS2 = qS - vend
    # stop do SOXL vai ao preço médio (P3)
    stop_soxl = a["P"]
    risco_total = max(0, (b["P"] - stS) * qS2)
    eL1, eS1 = exposicao(qL, P1, 3, 1, 1), exposicao(qS2, P2, 3, -1, 1)
    qa, s, trava = q_pyramiding(cap, qL, a["P"], stop_soxl, qL, P1, 3, 1, 1, a["atr_intra"], a["S"],
                                eL1 + eS1, abs(eL1) + abs(eS1), risco_total, teto)
    qt = qL + qa
    el = exposicao(qt, P1, 3, 1, 1) + eS1
    eb = abs(exposicao(qt, P1, 3, 1, 1)) + abs(eS1)
    got = {"q_SOXL": qL, "stop_SOXL": stL, "q_SQQQ": qS, "stop_SQQQ": stS,
           "pnl_r_SOXL": round((P1 - a["P"]) * qL / R, 2), "pnl_r_SQQQ": rS, "vender_SQQQ": vend,
           "comprar_SOXL_pyr": qa, "novo_stop_SOXL": s, "exp_liq_final": round(el, 2), "exp_bruta_final": round(eb, 2)}
    erros = {k: (got[k], e[k]) for k in e if abs(got[k] - e[k]) > 1e-6}
    assert not erros, erros
    assert trava == "concentracao", trava


def testes_casos():
    assert qtd_reducao(0, 1 / 3, "P3") == 0
    assert qtd_reducao(1, 1 / 3, "P5") == 0
    assert qtd_reducao(1, 1 / 3, "P3") == 1
    assert qtd_reducao(2, 1 / 3, "P3") == 1
    assert devolucao_pct(30, 29, 30, 1) is None
    assert lado("REDUZIR", -1) == "COMPRAR_PARA_COBRIR"
    assert lado("REDUZIR", 1) == "VENDER"
    assert exposicao(10, 20, 3, -1, 1) < 0          # bear comprado
    assert exposicao(10, 20, 3, -1, -1) > 0         # bear vendido
    # short: stop 20,80 não se afasta para 21,00 quando o preço sobe a 20,50
    assert stop_vigente(20.8, 20.5, 0.5, -1) == 20.8
    # short real: stop acima do preço
    assert stop_vigente(None, 20.0, 0.5, -1) > 20.0
    # ordem que atravessa o zero: -1,4x + entrada limitada a +1,5x
    cap = 25000
    q = q_limite_exposicao(-1.4 * cap, 1.4 * cap, 90.0, cap)
    assert abs(-1.4 * cap + q * 90.0) <= 1.5 * cap + 1e-6
    for bad in [(0, 3, 1, 250), (30, 3, 0, 250), (30, 3, 1, 0)]:
        try:
            dist_stop(*bad)
            raise AssertionError("dado inválido passou")
        except DadoInvalido:
            pass


def testes_propriedades(n=20000):
    rnd = random.Random(7)
    for _ in range(n):
        dir_, tipo = rnd.choice([1, -1]), rnd.choice([1, -1])
        q, P, L = rnd.randint(1, 500), rnd.uniform(1, 200), rnd.choice([2, 3])
        f, pr = rnd.choice([1 / 3, 1 / 2]), rnd.choice(["P2", "P3", "P4", "P5"])
        r = qtd_reducao(q, f, pr)
        assert 0 <= r <= q
        assert abs(exposicao(q - r, P, L, tipo, dir_)) <= abs(exposicao(q, P, L, tipo, dir_)) + 1e-9
        stop0, d = rnd.uniform(1, 200), rnd.uniform(0.01, 5)
        novo = stop_vigente(stop0, P, d, dir_)
        assert (novo >= stop0) if dir_ == 1 else (novo <= stop0)


if __name__ == "__main__":
    teste_exemplo()
    testes_casos()
    testes_propriedades()
    testes_revisao_2()
    print("OK: exemplo, casos-limite, 20.000 testes de propriedade e controles da revisão 2")
    sys.exit(0)
