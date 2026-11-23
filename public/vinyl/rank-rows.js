// A top ten you can change: each record as a row with its place, cover and name, a handle to drag it to a new place, and × to take it out.
// Shared by the crate's edit panel (index.html) and the 2026 maker (top10.html).
//   rankRows(el, records, { move(from, to), take(i), cover(r) })
// records are { title, artist, front?, thumb? } in ranked order, number one first. cover(r) gives a cover's address (default r.thumb || r.front).
// The rows redraw from the records each call; move and take only report what the hand did, so the caller saves it and calls again.
// On the handle, arrow keys move a record up or down one place. Colors, type and corners come from /vinyl/tokens.css.
(() => {
  const css = `
.rr{list-style:none;margin:0;padding:0;display:grid}
.rr li{display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 0;background:var(--sheet,#1e1e20);position:relative;touch-action:pan-y;-webkit-user-select:none;user-select:none}
.rr li+li{box-shadow:0 -1px 0 var(--line)}
.rr .rr-n{flex:none;width:22px;text-align:right;font-size:var(--fs-3);color:var(--t2);font-variant-numeric:tabular-nums}
.rr .rr-c{flex:none;width:40px;height:40px;border-radius:var(--r-cover);background:var(--soft);overflow:hidden}
.rr .rr-c img{display:block;width:100%;height:100%;object-fit:cover}
.rr .rr-t{flex:1;min-width:0;display:grid}
.rr .rr-t b{font-size:var(--fs-2);font-weight:500;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr .rr-t span{font-size:var(--fs-1);color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr button{all:unset;cursor:pointer;flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:var(--m);transition:color .2s,background-color .2s}
.rr button:hover{background:var(--hov);color:var(--fg)}
.rr button:focus-visible{outline:1px solid var(--ring);outline-offset:-2px}
.rr button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
.rr .rr-g{cursor:grab;touch-action:none}
.rr li.rr-d{z-index:2;background:var(--soft);border-radius:var(--r-in);box-shadow:var(--float);padding-inline:6px;margin-inline:-6px}
.rr li.rr-d .rr-g{cursor:grabbing}
.rr li.rr-s{transition:transform .32s var(--ease,cubic-bezier(.22,1,.36,1))}
@media(prefers-reduced-motion:reduce){.rr li.rr-s{transition:none}}`;
  if (!document.getElementById("rr-css")) {
    const s = document.createElement("style");
    s.id = "rr-css";
    s.textContent = css;
    document.head.append(s);
  }
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>';

  window.rankRows = (el, records, o = {}) => {
    const cover = o.cover || ((r) => r.thumb || r.front || "");
    el.classList.add("rr");
    el.innerHTML = records
      .map((r, i) => {
        const c = cover(r);
        return `<li data-i="${i}"><span class="rr-n">${i + 1}</span><span class="rr-c" style="${r.spine ? `background:${esc(r.spine)}` : ""}">${c ? `<img alt="" loading="lazy" src="${esc(c)}">` : ""}</span><span class="rr-t"><b>${esc(r.title)}</b><span>${esc(r.artist)}</span></span><button type="button" class="rr-x" aria-label="Take out ${esc(r.title)}">${X}</button><button type="button" class="rr-g" aria-label="Move ${esc(r.title)}, number ${i + 1}. Drag, or use the arrow keys">${GRIP}</button></li>`;
      })
      .join("");
    const done = (from, to) => { if (from !== to) o.move?.(from, to); };
    el.onclick = (e) => {
      const x = e.target.closest(".rr-x");
      if (x) o.take?.(+x.closest("li").dataset.i);
    };
    el.onkeydown = (e) => {
      const g = e.target.closest(".rr-g");
      if (!g || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const i = +g.closest("li").dataset.i, to = Math.max(0, Math.min(records.length - 1, i + (e.key === "ArrowUp" ? -1 : 1)));
      if (to === i) return;
      done(i, to);
      requestAnimationFrame(() => el.querySelector(`li[data-i="${to}"] .rr-g`)?.focus({ focusVisible: true }));
    };
    // drag: the row follows the finger; a neighbor it passes halfway slides into the gap, and the numbers change as it goes
    el.onpointerdown = (e) => {
      const g = e.target.closest(".rr-g");
      if (!g || e.button > 0) return;
      e.preventDefault();
      const row = g.closest("li"), from = +row.dataset.i, rows = [...el.children], h = rows.map((r) => r.offsetHeight);
      const k = row.getBoundingClientRect().height / row.offsetHeight || 1; // a scaled panel
      let at = from, y0 = e.clientY;
      row.classList.add("rr-d");
      rows.forEach((r) => r !== row && r.classList.add("rr-s"));
      const shift = () => {
        rows.forEach((r, j) => {
          if (r === row) return;
          const d = from < at && j > from && j <= at ? -h[from] : from > at && j < from && j >= at ? h[from] : 0;
          r.style.transform = d ? `translateY(${d}px)` : "";
          r.querySelector(".rr-n").textContent = String(j + 1 + (d < 0 ? -1 : d > 0 ? 1 : 0));
        });
        row.querySelector(".rr-n").textContent = String(at + 1);
      };
      const mv = (ev) => {
        const dy = (ev.clientY - y0) / k;
        row.style.transform = `translateY(${dy}px)`;
        // where its middle is now, among the others' resting places
        let off = 0, to = from;
        if (dy > 0) for (let j = from + 1; j < rows.length && dy > off + h[j] / 2; j++) { off += h[j]; to = j; }
        else for (let j = from - 1; j >= 0 && -dy > off + h[j] / 2; j--) { off += h[j]; to = j; }
        if (to !== at) { at = to; shift(); navigator.vibrate?.(4); }
      };
      const up = () => {
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        rows.forEach((r) => { r.classList.remove("rr-s", "rr-d"); r.style.transform = ""; });
        done(from, at);
      };
      addEventListener("pointermove", mv);
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    };
  };
})();
