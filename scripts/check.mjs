/**
 * Light checks on index.html, run before every save. Plain Node, no packages.
 *
 *   node scripts/check.mjs            content check: everything else must match the last commit
 *   node scripts/check.mjs --design   for an engineer: skips that one comparison
 *
 * Problems are written so they can be passed on to a non-technical owner. Exit code 1 means
 * "do not save".
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Longest text, in characters, that each place holds before it looks wrong. */
const LIMITS = {
  name: 24, subtitle: 40, lede: 120, paragraph: 320, projectTitle: 70, roleTitle: 60,
  label: 40, org: 60, number: 8, result: 50, email: 40, meta: 60, tag: 40, detail: 160,
  alt: 140, cta: 40,
};
/** [fewest, most] items in each list. */
const COUNTS = {
  project: [1, 12], role: [1, 8], school: [1, 6], stat: [1, 4], social: [1, 6],
  skillGroup: [1, 6], tag: [1, 12], detail: [1, 8],
};
const SECTIONS = ['about', 'experience', 'projects', 'skills', 'education', 'contact'];
const CARD_NAMES = 'About, Experience, Projects, Skills, Education, Contact';
const TAGS = new Set(['section', 'h2', 'h3', 'p', 'a', 'div', 'dl', 'dt', 'dd', 'ol', 'ul', 'li', 'article', 'span', 'em', 'strong', 'br', 'img', 'details', 'summary']);
/** Tags with no closing tag. */
const VOID = new Set(['br', 'img']);
const CLASSES = new Set(['section', 'about', 'about-text', 'lede', 'stats', 'label', 'num', 'roles', 'role', 'org', 'projects', 'project', 'cover', 'b', 'c', 'd', 'photo', 'meta', 'result', 'more', 'skills', 'tags', 'contact-cta', 'socials']);
const ATTRIBUTES = new Set(['class', 'id', 'href', 'aria-hidden', 'src', 'alt', 'width', 'height', 'loading']);

const problems = [];
/** Worth telling Dania, but no reason to stop a save. */
const notes = [];
/** Record a note. @param {string} text one plain sentence */
const note = (text) => notes.push(text);
/** Record a problem. @param {string} text one plain sentence */
const problem = (text) => problems.push(text);

/** Read text with one line ending, so Windows and Mac copies compare equal. @param {string} s */
const normalise = (s) => s.replace(/\r\n/g, '\n');

/** Named entities written out; any other is shown as "?". Each counts as one character. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** One entity as the character it stands for. @param {string} code what is between & and ; */
const decode = (code) => {
  const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : code.startsWith('#') ? Number(code.slice(1)) : NaN;
  if (n >= 0 && n <= 0x10ffff) return String.fromCodePoint(n);
  return ENTITIES[code.toLowerCase()] || '?';
};
/** Text content with entities decoded. @param {Object} node */
const textOf = (node) => (node.text !== undefined ? node.text : node.children.map(textOf).join(''))
  .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (_, code) => decode(code)).replace(/\s+/g, ' ').trim();

/**
 * The page with every part Dania may edit blanked out. What is left must not change.
 * @param {string} html
 */
const protectedParts = (html) => html
  .replace(/<title>[^<]*<\/title>/, '<title/>')
  .replace(/(<header class="banner">[\s\S]*?<h1>)[^<]*(<\/h1>)/, '$1$2')
  .replace(/(<p class="banner-sub">)[^<]*(<\/p>)/, '$1$2')
  .replace(/<main>[\s\S]*<\/main>/, '<main/>');

/**
 * Parse a fragment into a small tree, reporting tags that are unknown, unclosed or crossed.
 * @param {string} source
 * @returns {{tag: string, attrs: Object, children: Array}} root node
 */
const parse = (source) => {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  // Comments, tags, a stray "<", or plain text, in that order.
  const token = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|<|[^<]+/gi;
  for (const [raw, close, name, attrText] of source.matchAll(token)) {
    if (raw.startsWith('<!--')) continue;
    const top = stack[stack.length - 1];
    if (!name) {
      if (raw === '<') problem('There is a "<" sign or a broken tag in the text.');
      else top.children.push({ text: raw });
      continue;
    }
    const tag = name.toLowerCase();
    if (!TAGS.has(tag)) problem(`The page has something it does not allow: "${tag}".`);
    if (close) {
      if (top.tag === tag && stack.length > 1) stack.pop();
      else problem(`Part of the page is not closed properly (near "${tag}").`);
      continue;
    }
    const attrs = {};
    for (const [, key, value = ''] of attrText.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (!ATTRIBUTES.has(key)) problem(`The page has a setting it does not allow: "${key}".`);
      attrs[key] = value;
    }
    for (const c of (attrs.class || '').split(/\s+/).filter(Boolean)) {
      if (!CLASSES.has(c)) problem(`The page uses a style that does not exist: "${c}".`);
    }
    const node = { tag, attrs, children: [] };
    top.children.push(node);
    if (!VOID.has(tag)) stack.push(node);
  }
  if (stack.length > 1) problem(`Part of the page is not closed properly ("${stack[stack.length - 1].tag}").`);
  return root;
};

/** Every element below a node that passes a test. @param {Object} node @param {Function} test */
const all = (node, test) => (node.children || []).flatMap((child) => (child.tag
  ? [...(test(child) ? [child] : []), ...all(child, test)] : []));
/** Test for a class name. @param {string} name */
const hasClass = (name) => (node) => (node.attrs.class || '').split(/\s+/).includes(name);
/** Test for a tag name. @param {string} name */
const isTag = (name) => (node) => node.tag === name;

/** Check that a text is present and fits. @param {string} what @param {string} text @param {number} limit */
const fits = (what, text, limit) => {
  if (!text) problem(`${what} is empty.`);
  else if (text.length > limit) problem(`${what} is ${text.length} characters; it can be at most ${limit}: "${text}"`);
  else if (limit >= 40 && text.length > limit * 0.95) note(`${what} is almost full: "${text}"`);
};
/** Check a list's length. @param {string} what @param {number} count @param {number[]} range */
const counted = (what, count, [min, max]) => {
  if (count < min) problem(`There must be at least ${min} ${what}; there are ${count}.`);
  if (count > max) problem(`There can be at most ${max} ${what}; there are ${count}.`);
};

const html = normalise(readFileSync(`${ROOT}index.html`, 'utf8'));

// 1. Nothing outside the editable parts changed since the last save.
if (!process.argv.includes('--design')) {
  let saved = null;
  try {
    saved = normalise(execFileSync('git', ['show', 'HEAD:index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e7 }));
  } catch (error) {
    problem('The last saved page could not be read, so the design cannot be compared.');
  }
  if (saved !== null && protectedParts(saved) !== protectedParts(html)) {
    problem('Something in the design changed (styles, scripts, menu or background). Only JC changes those.');
  }
}

// 2. Name, title and subtitle.
const pick = (re) => ((html.match(re) || [])[1] || '').trim();
const name = pick(/<h1>([^<]*)<\/h1>/);
fits('The name', name, LIMITS.name);
fits('The subtitle', pick(/<p class="banner-sub">([^<]*)<\/p>/), LIMITS.subtitle);
if (pick(/<title>([^<]*)<\/title>/) !== name) problem('The name on the page and the name on the browser tab are different.');

// 3. The four cards.
const main = html.match(/<main>([\s\S]*)<\/main>/);
if (!main) problem('The main part of the page is missing.');
else {
  const tree = parse(main[1]);
  const sections = tree.children.filter((n) => n.tag);
  if (sections.map((s) => s.attrs.id).join() !== SECTIONS.join()) problem(`The cards (${CARD_NAMES}) must all be there, in that order.`);

  for (const section of sections) {
    const h2 = all(section, isTag('h2'));
    const title = h2.length === 1 ? textOf(h2[0]) : '';
    // The heading and both menus must agree, or a menu word leads to a differently named card.
    const links = [...html.matchAll(/<a class="nav-link-mono" href="#([\w-]+)">([^<]*)<\/a>/g)].filter((m) => m[1] === section.attrs.id);
    if (!links.length || links.some((m) => m[2] !== title)) problem(`The heading of the "${section.attrs.id}" card does not match the menu.`);
  }

  for (const n of all(tree, hasClass('lede'))) fits('An opening line', textOf(n), LIMITS.lede);
  for (const n of all(tree, isTag('p'))) fits('A paragraph', textOf(n), LIMITS.paragraph);
  for (const n of all(tree, hasClass('label')).filter((l) => l.tag !== 'ul')) fits('A small label', textOf(n), LIMITS.label);
  for (const n of all(tree, hasClass('num'))) fits('A big number', textOf(n), LIMITS.number);

  const stats = all(tree, hasClass('stats')).flatMap((s) => s.children.filter(isElement));
  counted('numbers in About', stats.length, COUNTS.stat);
  for (const s of stats) {
    if (all(s, isTag('dt')).length !== 1 || all(s, hasClass('num')).length !== 1) problem('Each number in About needs one number and one description.');
  }

  /** The cards by id. */
  const card = (id) => sections.find((n) => n.attrs.id === id) || { children: [] };
  /** The rows of a timeline card (Experience, Education): dates, title, place, description. */
  const timeline = (id, what, count, descriptionOptional) => {
    const rows = all(card(id), hasClass('roles')).flatMap((r) => r.children.filter(isElement));
    counted(what, rows.length, count);
    for (const r of rows) {
      const h3 = all(r, isTag('h3'));
      const org = all(r, hasClass('org'));
      const ps = all(r, isTag('p')).length;
      if (h3.length !== 1 || org.length !== 1 || all(r, hasClass('label')).length !== 1 || !(ps === 2 || (descriptionOptional && ps === 1))) {
        problem(descriptionOptional ? `Each entry in ${id} needs dates, a title and a place, and at most one description.` : `Each entry in ${id} needs dates, a title, a place and one description.`);
      } else { fits(`A title in ${id}`, textOf(h3[0]), LIMITS.roleTitle); fits(`A place in ${id}`, textOf(org[0]), LIMITS.org); }
    }
  };
  timeline('experience', 'roles', COUNTS.role, false);
  timeline('education', 'entries in Education', COUNTS.school, true);

  // Projects: kind of work, title, place and dates, one description, and a photo or a cover.
  // A number and a "What I did" list are optional.
  const projects = all(tree, hasClass('project'));
  counted('projects', projects.length, COUNTS.project);
  let covers = 0;
  projects.forEach((p, i) => {
    const h3 = all(p, isTag('h3'));
    const meta = all(p, hasClass('meta'));
    const result = all(p, hasClass('result'));
    const photo = all(p, hasClass('photo'));
    const cover = all(p, hasClass('cover'));
    const more = all(p, hasClass('more'));
    const descriptions = all(p, isTag('p')).filter((n) => !['label', 'meta', 'result'].some((c) => hasClass(c)(n)));
    if (h3.length !== 1 || meta.length !== 1 || all(p, hasClass('label')).length !== 1 || descriptions.length !== 1 || photo.length + cover.length !== 1 || result.length > 1 || more.length > 1) {
      problem(`Project ${i + 1} needs a kind of work, a title, a place or date line, one description, and a photo or a cover.`);
      return;
    }
    fits('A project title', textOf(h3[0]), LIMITS.projectTitle);
    fits('A project place or date line', textOf(meta[0]), LIMITS.meta);
    if (result.length) {
      if (all(result[0], hasClass('num')).length !== 1) problem(`The result of project ${i + 1} needs one number.`);
      fits('A project result', textOf(result[0]), LIMITS.result);
    }
    if (more.length) {
      const items = all(more[0], isTag('li'));
      if (all(more[0], isTag('summary')).length !== 1 || all(more[0], isTag('ul')).length !== 1) problem(`The "What I did" list of project ${i + 1} is not set up properly.`);
      counted(`points in the "What I did" list of project ${i + 1}`, items.length, COUNTS.detail);
      for (const li of items) fits('A "What I did" point', textOf(li), LIMITS.detail);
    }
    if (cover.length) {
      const expected = ['cover', 'cover b', 'cover c', 'cover d'][covers % 4];
      covers += 1;
      if (cover[0].attrs.class !== expected) problem(`The cover of project ${i + 1} is out of order.`);
    }
  });

  // Photos: only ones already in the images folder, each described for people who cannot see it.
  for (const img of all(tree, isTag('img'))) {
    const { src = '', alt, width, height, loading } = img.attrs;
    if (!/^images\/[a-z0-9-]+\.(jpg|png|webp)$/.test(src) || !existsSync(`${ROOT}${src}`)) problem(`This photo is missing or not in the photo folder: "${src}"`);
    if (img.attrs.class !== 'photo') problem(`The photo "${src}" is in a place that has no room for photos.`);
    fits(`The description of the photo "${src}"`, (alt || '').trim(), LIMITS.alt);
    if (!/^\d+$/.test(width || '') || !/^\d+$/.test(height || '') || loading !== 'lazy') problem(`The photo "${src}" is missing its size or loading setting.`);
  }

  // Skills: a few areas, each with a short list.
  const groups = all(tree, hasClass('skills')).flatMap((s) => s.children.filter(isElement));
  counted('skill areas', groups.length, COUNTS.skillGroup);
  for (const g of groups) {
    const h3 = all(g, isTag('h3'));
    const tags = all(g, hasClass('tags')).flatMap((t) => t.children.filter(isElement));
    if (h3.length !== 1) problem('Each skill area needs one name.');
    else counted(`skills under "${textOf(h3[0])}"`, tags.length, COUNTS.tag);
    for (const t of tags) fits('A skill', textOf(t), LIMITS.tag);
  }

  counted('social links', all(tree, hasClass('socials')).flatMap((s) => all(s, isTag('a'))).length, COUNTS.social);

  // Links: to a card on this page, an email, or a secure address.
  const ids = all(tree, (n) => n.attrs.id).map((n) => n.attrs.id);
  if (new Set(ids).size !== ids.length) problem('Two parts of the page share the same internal name.');
  for (const a of all(tree, isTag('a'))) {
    const href = a.attrs.href || '';
    if (!textOf(a)) problem('A link has no words to click on.');
    if (href.startsWith('#') ? !ids.includes(href.slice(1)) : !/^(mailto:[^\s@?]+@[^\s@?]+\.[a-z]{2,}|https:\/\/[^\s/.]+\.[^\s]+)$/i.test(href)) problem(`This link does not work: "${href}"`);
  }
  // Contact: one main way in, an email address or a booking link.
  const cta = all(tree, hasClass('contact-cta'));
  if (cta.length !== 1) problem('Contact needs exactly one main link: an email address or a booking link.');
  else if ((cta[0].attrs.href || '').startsWith('mailto:')) {
    fits('The email', textOf(cta[0]), LIMITS.email);
    if (cta[0].attrs.href !== `mailto:${textOf(cta[0])}`) problem('The email shown and the email it writes to are different.');
  } else fits('The words on the contact link', textOf(cta[0]), LIMITS.cta);
}

// 4. Notes: what a careful reader would point out.
if (main) {
  const tree = parse(main[1]);
  if (html.includes('SAMPLE CONTENT')) note('The page is still marked as sample text.');
  if (/mailto:[^"]*\.(example|test|invalid)"/i.test(html)) note('The email is a made-up one; messages will not arrive.');
  for (const a of all(tree, hasClass('socials')).flatMap((s) => all(s, isTag('a')))) {
    if ((a.attrs.href || '').startsWith('#')) note(`The ${textOf(a)} link does not go to ${textOf(a)} yet.`);
  }
  // Places and dates repeat by nature ("Mérida, Mexico"), so they are not counted as repeats.
  const repeatable = (n) => hasClass('meta')(n) || hasClass('org')(n);
  const texts = [...all(tree, isTag('p')), ...all(tree, isTag('h3'))];
  const seen = new Set();
  for (const n of texts) {
    const t = textOf(n);
    if (!repeatable(n) && seen.has(t)) note(`The same text appears twice: "${t}"`);
    if (!repeatable(n)) seen.add(t);
    const twice = t.match(/(?:^|\s)([\p{L}]+) \1(?=[\s.,;:!?]|$)/iu);
    if (twice) note(`A word is repeated: "${twice[0].trim()}"`);
    if (/\s[,.;:!?](\s|$)/.test(t)) note(`There is a space before a punctuation mark: "${t}"`);
  }
  for (const p of all(tree, hasClass('project'))) {
    const last = all(p, isTag('p')).pop();
    if (last && !/[.!?…]$/.test(textOf(last))) note(`A project description does not end with a full stop: "${textOf(last)}"`);
  }
  const ongoing = all(tree, hasClass('roles')).flatMap((r) => all(r, hasClass('label'))).filter((l) => /\b(now|present|today|actualidad|hoy|presente)\b/i.test(textOf(l)));
  if (ongoing.length > 1) note(`${ongoing.length} roles are marked as current.`);
}

/** An element, as opposed to text. @param {Object} node */
function isElement(node) { return Boolean(node.tag); }

if (problems.length) {
  console.error(`${problems.length} problem(s). Do not save.`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log('All checks passed.');
if (notes.length) console.log(`Notes (these do not block a save):\n${notes.map((n) => `- ${n}`).join('\n')}`);
