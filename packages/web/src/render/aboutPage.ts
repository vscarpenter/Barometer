import { el } from "./dom.js";

const REPO_URL = "https://github.com/vscarpenter/Barometer";

// Reused from the README's diagram alt text — one honest description of the system.
const ARCH_ALT =
  "Barometer system architecture: nine provider status feeds polled by a scheduled " +
  "AWS Lambda, normalized and written as tiered JSON to a private S3 bucket, served via " +
  "CloudFront and Route 53 to a vanilla-TypeScript dashboard, with CloudWatch alarms " +
  "paging an SNS email alert.";

// The live provider set, including the two DNS active probes. Kept in step with
// packages/engine/src/config/providers.ts. The surrounding prose is count-neutral
// so it can't drift from this list (or from the dashboard's live count).
const PROVIDERS = [
  "Amazon Web Services",
  "Microsoft Azure",
  "Google Cloud",
  "Cloudflare",
  "GitHub",
  "OpenAI",
  "Anthropic",
  "Vercel",
  "DigitalOcean",
  "Cloudflare DNS (1.1.1.1)",
  "Google DNS (8.8.8.8)",
];

function externalLink(href: string, text: string): HTMLAnchorElement {
  const a = el("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function section(heading: string): HTMLElement {
  const s = el("section", "about__section");
  const h = el("h2", "about__h2");
  h.textContent = heading;
  s.appendChild(h);
  return s;
}

function para(text: string, cls?: string): HTMLParagraphElement {
  const p = el("p", cls);
  p.textContent = text;
  return p;
}

/**
 * The theme-aware overview diagram. Both variants are in the DOM; CSS shows the
 * one matching html[data-theme] (a <picture media=prefers-color-scheme> would
 * follow the OS, not the site's manual toggle). width/height pin the aspect
 * ratio so there's no layout shift while the SVG loads. Both are eagerly loaded
 * (they're tiny SVGs and sit near the fold) so the theme swap is instant — no
 * blank box on arrival, no flash when toggling.
 */
function diagram(): HTMLElement {
  const figure = el("figure", "about__figure");
  for (const variant of ["light", "dark"] as const) {
    const img = el("img", `about__diagram about__diagram--${variant}`);
    img.src =
      variant === "dark"
        ? "/barometer-overview-almanac-dark.svg"
        : "/barometer-overview-almanac.svg";
    img.alt = ARCH_ALT;
    img.width = 1680;
    img.height = 905;
    figure.appendChild(img);
  }
  const caption = el("figcaption", "about__figcaption");
  caption.textContent =
    "Public status feeds → one normalized schema → tiered JSON on S3 → this dashboard.";
  figure.appendChild(caption);
  return figure;
}

/** The About page content: how a reading is produced, what it watches, the source. */
export function renderAboutPage(): HTMLElement {
  const root = el("div", "about");

  const nav = el("nav", "about__nav");
  const back = el("a", "about__back");
  back.href = "/";
  back.textContent = "← Dashboard";
  nav.appendChild(back);
  root.appendChild(nav);

  const header = el("header", "about__header");
  const h1 = el("h1", "about__title");
  h1.textContent = "About Barometer";
  header.append(
    h1,
    para(
      "Barometer is a weather station for the internet — a single-glance answer to " +
        "“is the internet healthy right now?” across the cloud, network, and AI " +
        "providers most of the web depends on.",
      "about__lede",
    ),
  );
  root.appendChild(header);

  const how = section("How it works");
  how.appendChild(
    para(
      "Barometer reads each provider's public status page every 5 minutes. Raw status " +
        "is normalized; weather labels are presentation only.",
    ),
  );
  how.appendChild(
    para(
      "A scheduled AWS Lambda fetches every feed, maps each provider's own format " +
        "into one shared schema, and writes tiered JSON to S3. This dashboard polls that " +
        "JSON every 60 seconds — there is no server rendering the page and no database.",
    ),
  );
  root.appendChild(how);

  const rule = section("How a provider counts");
  rule.appendChild(
    para(
      "One rule decides the reading. A provider is up when it reports operational, and " +
        "down when it reports degraded, a partial outage, or a major outage. Planned " +
        "maintenance and any feed we can't read are excluded — neither up nor down — so " +
        "scheduled work and our own fetch failures never fake an outage or a perfect 100%.",
    ),
  );
  rule.appendChild(
    para(
      "Incidents are region-scoped, too: an outage only moves the US reading if it affects " +
        "the United States. A provider's purely non-US incident stays visible on its tile " +
        "but never flips the overall reading or triggers an alert.",
    ),
  );
  root.appendChild(rule);

  const watches = section("What it watches");
  watches.appendChild(para("Barometer watches these cloud, network, and AI providers:"));
  const list = el("ul", "about__providers");
  for (const name of PROVIDERS) {
    const li = el("li");
    li.textContent = name;
    list.appendChild(li);
  }
  watches.appendChild(list);
  root.appendChild(watches);

  const arch = section("Architecture");
  arch.appendChild(diagram());
  root.appendChild(arch);

  const source = section("Open source");
  const colophon = el("p");
  colophon.append(
    document.createTextNode(
      "Barometer is built with vanilla TypeScript and runs serverless on AWS " +
        "(Lambda, S3, CloudFront, Route 53). The code is on GitHub: ",
    ),
    externalLink(REPO_URL, "github.com/vscarpenter/Barometer"),
    document.createTextNode("."),
  );
  source.appendChild(colophon);
  root.appendChild(source);

  return root;
}
