import "./styles.css";

// Mount target; the data wiring (poll loop + render) is added in the render task.
const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.innerHTML = `<div class="state">Reading the barometer…</div>`;
}
