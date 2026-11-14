// Takes the splash page's screenshots (site/static/shots/) from a running dev
// stack. Run through scripts/shoot-splash.sh, which gives the stack a database
// of its own, rather than on its own: it seeds through the API, and against a
// shared database that would land in everyone's dev data.
//
// Everything on screen is the dev roster (test_data/volunteers.csv), which is
// synthetic, and the dev Organisation, whose name no shot shows.
//
// Usage, from web/: bun shoot-splash.ts <origin> <out dir>

import { chromium, type APIRequestContext, type Page } from "playwright-core";
import { spawnSync } from "node:child_process";

const [origin, outDir] = process.argv.slice(2);
if (!origin || !outDir) {
  console.error("usage: bun shoot-splash.ts <origin> <out dir>");
  process.exit(2);
}
const org = `${origin}/org/dev-org`;

// The pattern the splash's own board shows, so the shot and the board agree:
// every Saturday 10:00 to 14:00, and the first Sunday of the month 12:00 to
// 16:00. It starts from today rather than the board's own months, so no Shift
// in a shot is already past.
function ymd(d: Date) {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}
const today = new Date();
const saturday = new Date(today);
saturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
const sunday = new Date(today.getFullYear(), today.getMonth() + 1, 1);
sunday.setDate(1 + ((7 - sunday.getDay()) % 7));
const pattern = [
  "BEGIN:VEVENT",
  `DTSTART:${ymd(saturday)}T100000`,
  "DURATION:PT4H",
  "RRULE:FREQ=WEEKLY;BYDAY=SA",
  "END:VEVENT",
  "BEGIN:VEVENT",
  `DTSTART:${ymd(sunday)}T120000`,
  "DURATION:PT4H",
  "RRULE:FREQ=MONTHLY;BYDAY=1SU",
  "END:VEVENT",
].join("\n");

async function call(api: APIRequestContext, method: string, path: string, data?: unknown) {
  const res = await api.fetch(`${org}/api${path}`, { method, data });
  if (!res.ok()) {
    throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// A shot is a PNG at twice the CSS size, for sharp text on a high-density
// screen; the wrapper turns it into WebP.
async function shoot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  // No caret, and nothing caught mid-transition. The contexts bypass the CSP
  // for this tag alone: the page itself is served exactly as in production.
  await page.addStyleTag({ content: "*{caret-color:transparent!important;transition:none!important;animation:none!important}" });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot ${name}`);
}

const browser = await chromium.launch();
try {
  const desk = await browser.newContext({ viewport: { width: 1040, height: 720 }, deviceScaleFactor: 2, bypassCSP: true });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    bypassCSP: true,
  });
  // The dev stack mints an Organiser session at /auth/login, no Google.
  const page = await desk.newPage();
  await page.goto(`${org}/auth/login`);
  const api = desk.request;

  // The Organisation's defaults: the board's pattern, a timezone, and a Shift
  // of one Team lead and three Service volunteers, the dev roster's two Roles.
  await call(api, "PUT", "/rota-defaults/timezone", { shiftTimezone: "Europe/London" });
  await call(api, "PUT", "/rota-defaults/shift-pattern", { shiftPattern: pattern });
  const roles: { id: string; name: string }[] = await call(api, "GET", "/roles").then((r) => (Array.isArray(r) ? r : r.roles));
  const role = (name: string) => {
    const found = roles.find((r) => r.name === name);
    if (!found) throw new Error(`no Role named ${name} in ${JSON.stringify(roles)}`);
    return found.id;
  };
  await call(api, "PUT", "/rota-defaults/shape", {
    seats: [
      { roleId: role("Team lead"), count: 1 },
      { roleId: role("Service volunteer"), count: 3 },
    ],
  });

  // A rota of eight Shifts, and its availability round.
  await call(api, "POST", "/rotations", { shiftCount: 8 });
  const round = await call(api, "GET", "/availability-rounds");
  // Someone rostered alone, so the form is theirs and nobody else's.
  const solo = round.groups.find((g: { members: unknown[] }) => g.members.length === 1) ?? round.groups[0];
  const link: string = solo.members[0].link;

  // Everyone answers, so the solver has something to work from and the form
  // shot shows a volunteer's answers rather than an empty form.
  const answered = spawnSync(
    "python3",
    ["scripts/fake-availability.py", "--api-url", org, "--seed", "1", "--mean", "0.7", "--reply-rate", "1"],
    { stdio: "inherit", cwd: ".." },
  );
  if (answered.status !== 0) throw new Error("fake-availability.py failed");

  // 1. The pattern, with the calendar of what it makes.
  await page.goto(`${org}/organiser/config`);
  const rotaCard = page.getByRole("button", { name: /^Rota\b/ });
  await rotaCard.click();
  await rotaCard.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24));
  await shoot(page, "pattern");

  // 2. A volunteer's availability form, on a phone.
  const form = await phone.newPage();
  await form.goto(new URL(new URL(link).pathname, origin).toString());
  await shoot(form, "availability");

  // 3. The solver's draft.
  await call(api, "POST", "/draft-rota-allocation");
  await page.goto(`${org}/organiser/allocation`);
  await shoot(page, "allocation");

  // 4. Published, and read on a phone.
  const draft = await call(api, "POST", "/draft-rota-allocation");
  await call(api, "POST", "/rotations/in-flight/allocation", { draftHash: draft.draftHash ?? draft.hash });
  const rota = await phone.newPage();
  await rota.goto(`${org}/`);
  await shoot(rota, "rota");
} finally {
  await browser.close();
}
