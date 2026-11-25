/**
 * Light checks on index.html, run before every save. Plain Node, no packages.
 *
 *   node scripts/check.mjs            content check: everything else must match the last commit
 *   node scripts/check.mjs --design   for an engineer: skips that one comparison
 *
 * Problems are written so they can be passed on to a non-technical owner. Exit code 1 means
 * "do not save".
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Longest text, in characters, that each place holds before it looks wrong. */
const LIMITS = {
  name: 24, subtitle: 40, lede: 120, paragraph: 320, projectTitle: 70, roleTitle: 60,
  label: 40, org: 60, number: 8, result: 50, email: 40,
};
/** [fewest, most] items in each list. */
const COUNTS = { project: [1, 8], role: [1, 8], stat: [1, 4], social: [1, 6] };
const SECTIONS = ['about', 'experience', 'projects', 'contact'];
const TAGS = new Set(['section', 'h2', 'h3', 'p', 'a', 'div', 'dl', 'dt', 'dd', 'ol', 'ul', 'li', 'article', 'span', 'em', 'strong', 'br']);
const CLASSES = new Set(['section', 'about', 'about-text', 'lede', 'stats', 'label', 'num', 'roles', 'role', 'org', 'projects', 'project', 'cover', 'b', 'c', 'd', 'result', 'contact-mail', 'socials']);
const ATTRIBUTES = new Set(['class', 'id', 'href', 'aria-hidden']);

const problems = [];
/** Worth telling Dania, but no reason to stop a save. */
const notes = [];
/** Record a note. @param {string} text one plain sentence */
const note = (text) => notes.push(text);
/** Record a problem. @param {string} text one plain sentence */
const problem = (text) => problems.push(text);

/** Read text with one line ending, so Windows and Mac copies compare equal. @param {string} s */
const normalise = (s) => s.replace(/\r\n/g, '\n');

/** Text content with entities for one character counted as one. @param {Object} node */
const textOf = (node) => (node.text !== undefined ? node.text : node.children.map(textOf).join(''))
  .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, '?').replace(/\s+/g, ' ').trim();

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
    if (tag !== 'br') stack.push(node);
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
  if (sections.map((s) => s.attrs.id).join() !== SECTIONS.join()) problem('The four cards (About, Experience, Projects, Contact) must all be there, in that order.');

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

  const roles = all(tree, hasClass('roles')).flatMap((r) => r.children.filter(isElement));
  counted('roles', roles.length, COUNTS.role);
  for (const r of roles) {
    const h3 = all(r, isTag('h3'));
    const org = all(r, hasClass('org'));
    if (h3.length !== 1 || org.length !== 1 || all(r, hasClass('label')).length !== 1 || all(r, isTag('p')).length !== 2) problem('Each role needs dates, a title, a place and one description.');
    else { fits('A role title', textOf(h3[0]), LIMITS.roleTitle); fits('A role place', textOf(org[0]), LIMITS.org); }
  }

  const projects = all(tree, hasClass('project'));
  counted('projects', projects.length, COUNTS.project);
  projects.forEach((p, i) => {
    const h3 = all(p, isTag('h3'));
    const result = all(p, hasClass('result'));
    const cover = all(p, hasClass('cover'));
    if (h3.length !== 1 || result.length !== 1 || cover.length !== 1 || all(p, hasClass('num')).length !== 1 || all(p, hasClass('label')).length !== 1 || all(p, isTag('p')).length !== 3) {
      problem('Each project needs a kind of work, a title, a result with a number, and one description.');
      return;
    }
    fits('A project title', textOf(h3[0]), LIMITS.projectTitle);
    fits('A project result', textOf(result[0]), LIMITS.result);
    const expected = ['cover', 'cover b', 'cover c', 'cover d'][i % 4];
    if (cover[0].attrs.class !== expected) problem(`The cover of project ${i + 1} is out of order.`);
  });

  counted('social links', all(tree, hasClass('socials')).flatMap((s) => all(s, isTag('a'))).length, COUNTS.social);

  // Links: to a card on this page, an email, or a secure address.
  const ids = all(tree, (n) => n.attrs.id).map((n) => n.attrs.id);
  if (new Set(ids).size !== ids.length) problem('Two parts of the page share the same internal name.');
  for (const a of all(tree, isTag('a'))) {
    const href = a.attrs.href || '';
    if (!textOf(a)) problem('A link has no words to click on.');
    if (href.startsWith('#') ? !ids.includes(href.slice(1)) : !/^(mailto:[^\s@?]+@[^\s@?]+\.[a-z]{2,}|https:\/\/[^\s/.]+\.[^\s]+)$/i.test(href)) problem(`This link does not work: "${href}"`);
  }
  const mail = all(tree, hasClass('contact-mail'));
  if (mail.length !== 1) problem('Contact needs exactly one email address.');
  else {
    fits('The email', textOf(mail[0]), LIMITS.email);
    if (mail[0].attrs.href !== `mailto:${textOf(mail[0])}`) problem('The email shown and the email it writes to are different.');
  }
}

// 4. Notes: what a careful reader would point out.
if (main) {
  const tree = parse(main[1]);
  if (html.includes('SAMPLE CONTENT')) note('The page is still marked as sample text.');
  if (/mailto:[^"]*\.(example|test|invalid)"/i.test(html)) note('The email is a made-up one; messages will not arrive.');
  for (const a of all(tree, hasClass('socials')).flatMap((s) => all(s, isTag('a')))) {
    if ((a.attrs.href || '').startsWith('#')) note(`The ${textOf(a)} link does not go to ${textOf(a)} yet.`);
  }
  const texts = [...all(tree, isTag('p')), ...all(tree, isTag('h3'))].map(textOf);
  const seen = new Set();
  for (const t of texts) {
    if (seen.has(t)) note(`The same text appears twice: "${t}"`);
    seen.add(t);
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
