import "./styles.css";
import { renderAboutPage } from "./render/aboutPage.js";
import { buildThemeToggle } from "./render/theme.js";
import { buildFooter } from "./render/footer.js";

// Entry point for /about.html. The page content is built by renderAboutPage
// (tested separately); this only mounts it, drops the shared theme toggle into
// the top nav so the page (and its theme-aware diagram) can be flipped here too,
// and appends the shared footer so it matches the dashboard. The footer goes
// inside .about so it aligns with the page's content column.
const root = document.querySelector<HTMLDivElement>("#about")!;
root.replaceChildren();

const page = renderAboutPage();
page.querySelector(".about__nav")?.appendChild(buildThemeToggle());
page.appendChild(buildFooter("about"));
root.appendChild(page);
