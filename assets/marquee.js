// Faixa de cotações do Painel: desliza para a esquerda em loop. Para com o mouse em cima, com foco
// no teclado ou com um clique/toque (outro clique retoma). Com "reduzir movimento", fica parada e rola à mão.
// A posição vive aqui (não no DOM), então continua de onde estava quando a página é redesenhada.

const SPEED = 40; // px/s

/** Próximo deslocamento: anda speed·dt e volta ao início ao completar uma volta (largura de um grupo). */
export function advance(offset, dt, width, speed = SPEED) {
  if (!(width > 0)) return 0;
  return (offset + speed * Math.max(0, Math.min(dt, 0.25))) % width;
}

let offset = 0;
let held = false;
let started = false;
// o laço de quadros só roda com a faixa na tela; wakeMarquee() religa depois de cada render
let running = false;
let loop = null;

/** Religa a faixa se ela está na tela e o laço dormia (chamado no fim de cada render). */
export const wakeMarquee = () => loop?.();

/** Estado inicial da faixa (para o HTML já sair com a classe certa). */
export const tapeHeld = () => held;

export function initMarquee() {
  if (started) return;
  started = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let prev = performance.now();
  const frame = (now) => {
    const dt = (now - prev) / 1000;
    prev = now;
    const tape = document.querySelector("[data-tape]");
    const track = tape?.querySelector(".tape-track");
    // sem faixa nesta aba (ou parada por "reduzir movimento"): o laço dorme até o próximo render
    if (!track || reduced.matches) {
      running = false;
      return;
    }
    const paused = held || tape.matches(":hover, :focus-within") || document.hidden;
    if (!paused) offset = advance(offset, dt, track.firstElementChild?.offsetWidth ?? 0);
    track.style.transform = `translate3d(${-offset}px,0,0)`;
    requestAnimationFrame(frame);
  };
  loop = () => {
    if (running) return;
    running = true;
    prev = performance.now();
    requestAnimationFrame(frame);
  };
  loop();
  // clique ou toque em qualquer ponto da faixa: pausa / retoma (o clique no ativo continua abrindo o gráfico)
  document.addEventListener("click", (e) => {
    const tape = e.target.closest("[data-tape]");
    if (!tape) return;
    held = !held;
    tape.classList.toggle("held", held);
  });
}
