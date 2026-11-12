/**
 * The home page film intro's first decision (see HeroVideo.tsx). The store
 * layout runs this as the first thing in <body>, before the banner and the
 * header are parsed, so they are hidden from the very first paint when the
 * film is going to play.
 *
 * The film plays on a full load of a home page (/, /en, /he) at most once
 * every 30 days per browser (owner request 2026-11-12: "not every time they
 * come in"; remembered in localStorage, not by IP: mobile carriers share one
 * IP between many customers, and storing IPs would be personal data), and
 * never with reduced motion, Save-Data, or a connection the browser reports as
 * 2G-class or under 3 Mbps (Chrome on Android reports it; Safari doesn't)
 * (those visitors get the end state, the podium still, straight away).
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

export const INTRO_PENDING_SCRIPT = `(function(){try{
if(!/^\\/(en|he)?\\/?$/.test(location.pathname))return;
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||'')||(c.downlink&&c.downlink<3)))return;
var seen=+localStorage.getItem(${JSON.stringify(INTRO_SEEN_KEY)})||0;if(Date.now()-seen<${INTRO_EVERY_MS})return;
var r=document.documentElement;r.setAttribute('data-kv-intro','');
document.addEventListener('DOMContentLoaded',function(){r.removeAttribute('data-kv-intro')});
}catch(e){}})()`;
