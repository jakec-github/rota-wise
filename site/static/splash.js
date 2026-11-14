// The splash page's one script: threads from each phrase of the sentence down
// to the column of Shifts it made. Decoration only. The page says everything
// without it, and on a screen too narrow for the sentence to sit on one line
// there is no room to draw them, so none are drawn.

const links = [
  ["m1", 5, "#13a38a"],
  ["m2", 5, "#13a38a"],
  ["m3", 6, "#8b5cf6"],
  ["m4", 6, "#8b5cf6"],
];
const svgNS = "http://www.w3.org/2000/svg";

function el(name, attrs) {
  const node = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function thread() {
  const board = document.querySelector(".board");
  const svg = board?.querySelector(".threads");
  if (!board || !svg) return;
  svg.replaceChildren();
  if (!matchMedia("(min-width: 1000px)").matches) return;

  const b = board.getBoundingClientRect();
  const heads = board.querySelector(".month").querySelectorAll(".dow");
  for (const [mark, column, colour] of links) {
    const m = board.querySelector("." + mark).getBoundingClientRect();
    const t = heads[column].getBoundingClientRect();
    const x1 = m.left + m.width / 2 - b.left;
    const y1 = m.bottom - b.top + 22;
    const x2 = t.left + t.width / 2 - b.left;
    const y2 = t.top - b.top - 3;
    const my = y1 + (y2 - y1) * 0.45;
    svg.append(
      el("circle", { cx: x1, cy: y1, r: 3, fill: colour }),
      el("path", {
        d: `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`,
        stroke: colour,
        "stroke-width": 1.75,
        fill: "none",
        "stroke-linecap": "round",
        opacity: 0.85,
      }),
      el("circle", { cx: x2, cy: y2, r: 3.5, fill: "#fff", stroke: colour, "stroke-width": 2 }),
    );
  }
}

document.fonts.ready.then(thread);
addEventListener("resize", thread);
