/**
 * The home page film intro's first decision (see HeroVideo.tsx). The store
 * layout runs this as the first thing in <body>, before the banner and the
 * header are parsed, so they are hidden from the very first paint when the
 * film is going to play.
 *
 * The film plays on a full load of a home page (/, /en, /he) when the browser's
 * HTTP cache has no fresh copy of INTRO_MARK_URL: the first visit, then again
 * after 30 days or whenever the visitor clears their cache (owner requests
 * 2026-11-12: "not every time they come in", "if I delete the cache it will
 * do it again"; per browser, not per IP: mobile carriers share one IP between
 * many customers, and storing IPs would be personal data), and
 * never with reduced motion, Save-Data, or a connection the browser reports as
 * 2G-class or under 3 Mbps (Chrome on Android reports it; Safari doesn't)
 * (those visitors get the end state, the podium still, straight away).
 *
 * The cache lookup is asynchronous, so the decision is a promise
 * (window.__kvIntro) that HeroVideo's play script waits on; until then the
 * page is held in the intro's look (a cache hit answers in a few ms).
 *
 * It only raises a flag on <html>; HeroVideo's own script moves it onto the
 * hero section a moment later (React resets <html>'s attributes on its
 * development remount, the hero section it leaves alone). If no hero picks
 * the flag up, it is dropped at DOMContentLoaded so the header can never stay
 * hidden.
 */
export const INTRO_SEEN_KEY = "kv-intro-seen";

/** How long a visitor goes without the film after seeing it. */
export const INTRO_EVERY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A tiny file the site serves with `Cache-Control: max-age` 30 days
 * (next.config.ts). Fetching it is the whole memory: answered from the cache
 * (transferSize 0) = seen within 30 days, skip; fetched from the network
 * (first visit, expired, or the visitor cleared the cache) = play. Browsers
 * that don't report transferSize (Safari before 16.4) fall back to a 30-day
 * timestamp in localStorage.
 */
export const INTRO_MARK_URL = "/home/hero/intro-mark.txt";

export const INTRO_PENDING_SCRIPT = `(function(){try{
if(!/^\\/(en|he)?\\/?$/.test(location.pathname))return;
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||'')||(c.downlink&&c.downlink<3)))return;
if(!window.fetch||!window.Promise||!window.performance)return;
var r=document.documentElement;r.setAttribute('data-kv-intro','');
document.addEventListener('DOMContentLoaded',function(){r.removeAttribute('data-kv-intro')});
function byMemory(){try{return Date.now()-(+localStorage.getItem(${JSON.stringify(INTRO_SEEN_KEY)})||0)>=${INTRO_EVERY_MS}}catch(e){return false}}
var url=new URL(${JSON.stringify(INTRO_MARK_URL)},location.href).href;
window.__kvIntro=fetch(url,{credentials:'omit'}).then(function(res){return res.text().then(function(){
var e=performance.getEntriesByName(url).pop();
if(e&&typeof e.transferSize==='number'&&e.decodedBodySize>0)return e.transferSize>0;
return byMemory()})},function(){return false});
}catch(e){}})()`;
