import "./styles.css";
import { renderAboutPage } from "./render/aboutPage.js";
import { buildThemeToggle } from "./render/theme.js";

// Entry point for /about.html. The page content is built by renderAboutPage
// (tested separately); this only mounts it and drops the shared theme toggle
// into the top nav so the page (and its theme-aware diagram) can be flipped here too.
const root = document.querySelector<HTMLDivElement>("#about")!;
root.replaceChildren();

const page = renderAboutPage();
page.querySelector(".about__nav")?.appendChild(buildThemeToggle());
root.appendChild(page);
