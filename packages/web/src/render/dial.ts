import type { ProviderStatus } from "@barometer/types";
import { svgEl } from "./dom.js";

/**
 * The barometer dial, made literal. v1 drew a dial in the masthead with a
 * hardcoded, frozen needle; here the needle actually sweeps to the live reading.
 * The angle is discrete (one stop per status, eased by a CSS transition) — we
 * don't imply false precision. The dial is decorative (aria-hidden): the weather
 * word + "X of Y operational" text remain the accessible source of truth.
 *
 * Geometry: a 180° gauge. Angle is measured from straight-up (0°), negative to
 * the left (Stormy), positive to the right (Fair):
 *   -90° = far left = Stormy ... +90° = far right = Fair.
 */
const NEEDLE_ANGLE: Record<ProviderStatus, number> = {
  major_outage: -75,
  partial_outage: -29,
  degraded: 22,
  operational: 72,
  maintenance: 72, // doesn't worsen the reading (SPEC §4) → "fair" zone
  unknown: 0, // instrument fault → centered
};

export function needleAngleFor(status: ProviderStatus): number {
  return NEEDLE_ANGLE[status];
}

const CX = 100;
const CY = 100;
const R = 82;
const NEEDLE_LEN = 70;

// Four equal weather zones, Stormy → Fair, each tinted with the matching status.
const ZONES: Array<{ from: number; to: number; status: ProviderStatus }> = [
  { from: -90, to: -45, status: "major_outage" },
  { from: -45, to: 0, status: "partial_outage" },
  { from: 0, to: 45, status: "degraded" },
  { from: 45, to: 90, status: "operational" },
];

function pointAt(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

/** Live barometer dial: tinted Stormy→Fair arc with a needle swung to `status`. */
export function renderDial(status: ProviderStatus): SVGElement {
  const svg = svgEl("svg");
  svg.classList.add("reading__dial");
  svg.setAttribute("viewBox", "0 0 200 116");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  // Faint full-arc backing so zones read as segments of one gauge.
  const backing = svgEl("path");
  const a0 = pointAt(-90, R);
  const a1 = pointAt(90, R);
  backing.setAttribute("d", `M ${a0.x} ${a0.y} A ${R} ${R} 0 0 1 ${a1.x} ${a1.y}`);
  backing.setAttribute("stroke", "var(--border)");
  backing.setAttribute("stroke-width", "13");
  backing.setAttribute("stroke-linecap", "round");
  svg.appendChild(backing);

  for (const zone of ZONES) {
    const p1 = pointAt(zone.from + 1.5, R);
    const p2 = pointAt(zone.to - 1.5, R);
    const arc = svgEl("path");
    arc.setAttribute("d", `M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`);
    arc.setAttribute("stroke", `var(--status-${zone.status})`);
    arc.setAttribute("stroke-width", "11");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("data-zone", zone.status); // updateDial sets the per-zone glow
    svg.appendChild(arc);
  }

  // Needle — drawn pointing straight up; updateDial rotates it to the reading so
  // the CSS transition on transform animates the sweep (reduced-motion disables it).
  const needle = svgEl("path");
  needle.classList.add("dial__needle");
  needle.setAttribute("d", `M ${CX} ${CY} L ${CX} ${CY - NEEDLE_LEN}`);
  needle.setAttribute("stroke", "var(--c)");
  needle.setAttribute("stroke-width", "3");
  needle.setAttribute("stroke-linecap", "round");
  needle.style.transformOrigin = `${CX}px ${CY}px`;
  svg.appendChild(needle);

  const hub = svgEl("circle");
  hub.setAttribute("cx", String(CX));
  hub.setAttribute("cy", String(CY));
  hub.setAttribute("r", "5.5");
  hub.setAttribute("fill", "var(--c)");
  svg.appendChild(hub);

  updateDial(svg, status);
  return svg;
}

/**
 * Swing the needle and re-light the zones in place — no rebuild. Reusing the
 * same SVG nodes across readings is what lets the CSS `transition: transform`
 * actually animate (a freshly-built needle would just snap to its final angle).
 */
export function updateDial(svg: SVGElement, status: ProviderStatus): void {
  const needle = svg.querySelector<SVGElement>(".dial__needle");
  if (needle) needle.style.transform = `rotate(${needleAngleFor(status)}deg)`;

  const litZone = ZONES.some((zone) => zone.status === status);
  for (const arc of svg.querySelectorAll<SVGElement>("[data-zone]")) {
    // Active zone glows, the rest dim so the eye lands on the reading. When the
    // status matches no zone (unknown/maintenance), all sit at a neutral level
    // so the gauge reads "no particular reading", not unlit/half-rendered.
    arc.setAttribute("opacity", !litZone ? "0.5" : arc.getAttribute("data-zone") === status ? "1" : "0.32");
  }
}
