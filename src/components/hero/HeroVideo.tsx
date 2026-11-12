import { getImageProps } from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProduct } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { Price } from "@/components/shared/Money";
import { InlineScript } from "@/components/shared/InlineScript";
import { titleFor } from "@/lib/product";
import { SHOWCASE_JERSEYS } from "@/data/showcase";
import { HeroChromeOffset } from "./HeroChromeOffset";
import { JerseyShowcase, type ShowcaseItem } from "./JerseyShowcase";
import { INTRO_SEEN_KEY } from "./intro";

/**
 * THE VIDEO HERO — the home page hero (owner request 2026-11-11).
 *
 * A 6.6 s film (public/home/hero/intro.mp4: the crest, the fabric, the number,
 * the floodlights) plays full screen on a visitor's first home page view (then
 * not again for 30 days, see ./intro.ts), with nothing else on screen and
 * scrolling locked. It ends on
 * its last frame — the empty podium under the spotlight — and then the site
 * comes in: the header and banner drop in, the copy slides in from the side,
 * the showcase shirt pops up onto the podium and its arrows slide in.
 *
 * Two cuts of the same film: landscape (intro.mp4, 16:9) and portrait
 * (intro-portrait.mp4, 9:16, owner's vertical version 2026-11-12) for every
 * portrait screen; each device downloads only its own, with its own poster
 * and last-frame still (podium.webp / podium-portrait.webp). Both are the
 * owner's 10 s, 36 fps originals sped up (owner request 2026-11-11): the
 * frames where the motion paused were dropped (picked by frame-to-frame
 * difference) and the rest play at 50 fps (1.39x; 60 fps felt rushed).
 * Landscape had real freezes mid-film (31 frames dropped, 6.6 s); portrait
 * only stops at the very end, so only that tail went (8 frames, 7.1 s) -
 * thinning its slow-but-moving stretches the same way made it feel faster
 * than the landscape cut (owner, 2026-11-12). Their LAST frames are
 * untouched: the showcase is aligned to them.
 *
 * Every later view (and reduced motion, Save-Data, slow connections, no JS,
 * soft navigations) is the end state straight away: the same last frame as a
 * still (podium.webp), the shirt on the podium, no film and no download.
 *
 * Alignment: .kv-vhero-stage is always the playing film's own frame box
 * (landscape: covers the hero on desktop, a podium-centred strip on landscape
 * phones; portrait: covers the whole first screen), and the film, the still
 * and the showcase all fill it, so the shirt is positioned in the frame's
 * pixels (SHOWCASE_STAGE / SHOWCASE_STAGE_PORTRAIT in src/data/showcase.ts)
 * and stays on the podium at every size. In the landscape film the podium is
 * left of centre and its right third is empty, so the copy sits on the right
 * in every locale (the film has the crest's lettering in it, so it can't be
 * mirrored for RTL like the old plate); on portrait screens the scene fills
 * the first screen and the copy follows below it.
 *
 * The intro is state on this element (data-intro="playing" -> "done"), set by
 * the inline scripts below during HTML parsing so nothing flashes before
 * hydration; globals.css ("THE VIDEO HERO") hides the header, banner, cookie
 * card and this hero's own UI while it plays, via :has(). The layout's
 * INTRO_PENDING_SCRIPT (./intro.ts) raises the flag on <html> even earlier,
 * before the header is parsed.
 */
export async function HeroVideo({ locale }: { locale: string }) {
  const t = await getTranslations("home.hero");

  // The interactive showcase (src/data/showcase.ts): each shirt's name and
  // link come from the catalogue; a shirt that is off the site links to /shop.
  // Demo items (the unbranded 360° test shirt) never reach production.
  const showcase: ShowcaseItem[] = SHOWCASE_JERSEYS.filter(
    (jersey) => !jersey.demo || process.env.VERCEL_ENV !== "production",
  ).map((jersey) => {
    const product = jersey.handle ? getProduct(jersey.handle) : undefined;
    return {
      id: jersey.id,
      views: jersey.views,
      title: product ? titleFor(product, locale) : jersey.name,
      href: product?.visible ? `/product/${product.handle}` : "/shop",
    };
  });

  // The film's last frame per orientation (art direction: the browser fetches
  // only the one its <source> picks). fetchPriority, not preload: preloading
  // would fetch both.
  const {
    props: { srcSet: portraitStill },
  } = getImageProps({ src: "/home/hero/podium-portrait.webp", alt: "", width: 1080, height: 1920, sizes: "125vw" });
  const {
    props: { srcSet: landscapeStill, ...still },
  } = getImageProps({ src: "/home/hero/podium.webp", alt: "", width: 1920, height: 1080, sizes: "(min-width: 900px) 100vw, 200vw" });

  // "From" prices exactly as the cards state them: smallest size, non-retro.
  const fanFrom = priceFor("2026/27", "S", "fan");
  const playerFrom = priceFor("2026/27", "S", "player");

  return (
    <section id="kv-vhero" className="kv-vhero" suppressHydrationWarning>
      <InlineScript html={START_SCRIPT} />
      <HeroChromeOffset />

      <div className="kv-vhero-stagewrap">
        <div className="kv-vhero-stage">
          {/* The film's last frame: the hero whenever the film isn't playing, including after it ends. */}
          <picture>
            <source media="(orientation: portrait)" srcSet={portraitStill} sizes="125vw" />
            {/* getImageProps output (alt=""), art-directed by the <source> above. */}
            <img {...still} alt="" srcSet={landscapeStill} fetchPriority="high" className="kv-vhero-still" />
          </picture>
          <video
            className="kv-vhero-video"
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden
            tabIndex={-1}
            suppressHydrationWarning
          />
          <span aria-hidden className="kv-vhero-flash" />
          <JerseyShowcase
            items={showcase}
            priority
            labels={{
              prev: t("showcasePrev"),
              next: t("showcaseNext"),
              rotate: t("showcaseRotate"),
              open: t("showcaseOpen"),
            }}
          />
        </div>
      </div>
      <div aria-hidden className="kv-vhero-shade" />

      <div className="kv-vhero-copy">
        <div className="kv-vhero-copy-inner">
          <div className="kv-vhero-col">
            <span
              className="kv-vhero-in mono-eyebrow kv-flood-eyebrow kv-flood-eyebrow-rule"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              {t("eyebrow")}
            </span>
            {/* Three authored lines: white, white, electric blue. Each rises out
              of its own clip box, transform only, since this is the LCP text. */}
            <h1 className="kv-stadium-display mt-4 mb-5">
              {(["titleA", "titleB", "titleC"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    className={index === 2 ? "kv-stadium-accent" : undefined}
                    style={
                      { "--kv-delay": `${index * 90}ms` } as React.CSSProperties
                    }
                  >
                    {t(key)}
                    {index < 2 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p
              className="kv-vhero-in kv-stadium-sub mb-8 max-w-[40ch]"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              {t("sub")}
            </p>

            <div
              className="kv-vhero-in mb-8 flex flex-wrap items-center gap-x-8 gap-y-5"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <Link href="/shop" className="kv-stadium-cta">
                {t("cta")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
              <Link href="/shop/national-teams" className="kv-stadium-link">
                {t("ctaSecondary")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            </div>

            {/* The price row: hairline above, three gold glyphs, each with a
              small label over a large blue price (Retro is an invitation,
              not a price). Hand-drawn inline SVGs, nothing to license. */}
            <div
              className="kv-vhero-in kv-stadium-meta"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              <div className="kv-stadium-meta-item">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path
                    d="M8 4 4 7l2.2 2.5L8 8v12h8V8l1.8 1.5L20 7l-4-3-2 1.5h-4L8 4Z"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="flex flex-col">
                  <span className="kv-stadium-meta-label">
                    {t("fanLabel")} {t("from")}
                  </span>
                  <Price value={fanFrom} className="kv-stadium-meta-price" />
                </span>
              </div>
              <div className="kv-stadium-meta-item">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path
                    d="M12 21 3 9.5 6.5 4h11L21 9.5 12 21Z"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 9.5h18M8.5 4 7 9.5l5 11.5 5-11.5L15.5 4M7 9.5 12 4l5 5.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="flex flex-col">
                  <span className="kv-stadium-meta-label">
                    {t("playerLabel")} {t("from")}
                  </span>
                  <Price value={playerFrom} className="kv-stadium-meta-price" />
                </span>
              </div>
              <Link href="/shop/retro" className="kv-stadium-meta-item">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path
                    d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5L3 8Z"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="kv-stadium-meta-strong">
                  {t("retroLabel")}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <InlineScript html={PLAY_SCRIPT} />
    </section>
  );
}

/**
 * Runs as the section opens, before any of it is parsed:
 * - measures the banner + header ([data-kv-chrome]) so the hero can sit
 *   underneath them (--kv-chrome-h, kept current by a ResizeObserver);
 * - takes the intro flag over from <html> (set by INTRO_PENDING_SCRIPT) onto
 *   this section: data-intro="playing".
 */
const START_SCRIPT = `(function(){var s=document.currentScript&&document.currentScript.parentElement;if(!s)return;var r=document.documentElement;
var c=document.querySelectorAll('[data-kv-chrome]');function m(){if(!s.isConnected)return;var t=0;for(var i=0;i<c.length;i++)t+=c[i].offsetHeight;s.style.setProperty('--kv-chrome-h',t+'px')}m();
if(window.ResizeObserver){var o=new ResizeObserver(m);for(var i=0;i<c.length;i++)o.observe(c[i])}
if(r.hasAttribute('data-kv-intro')){r.removeAttribute('data-kv-intro');s.setAttribute('data-intro','playing');try{window.scrollTo(0,0)}catch(e){}}})()`;

/**
 * Runs once the section is parsed: plays the film if this view has the
 * intro, then hands over to the site (data-intro="done") on the still of its
 * last frame, never on the video element: a browser that dropped the film's
 * final frames (a busy phone, a background tab) can be left showing one a
 * few frames early, with the podium a little off the shirt. The film stays up
 * only until the still has loaded, if it somehow hasn't. Every way it can go
 * wrong ends the intro early on the still instead of trapping the visitor
 * (measured 2026-11-12: on a 1.6 Mbps phone the old 3.5 s-per-stall rule let
 * the film limp on for 23 s): autoplay refused (iOS Low Power Mode), no first
 * frame within 3 s, 2 s of buffering in total, not finished by its own length
 * + 2.5 s, a load error, or 15 s in all. Escape skips it.
 */
const PLAY_SCRIPT = `(function(){var s=document.getElementById('kv-vhero');if(!s||s.getAttribute('data-intro')!=='playing')return;
var v=s.querySelector('video');var done=false,started=false,stall=0,t0=0,cap=0,safety=0,waitFrom=0,waited=0;
function finish(natural){if(done)return;done=true;clearTimeout(t0);clearTimeout(stall);clearTimeout(cap);clearTimeout(safety);removeEventListener('keydown',key);
try{v.pause()}catch(e){}
if(!natural){try{v.removeAttribute('src');v.load()}catch(e){}}
if(natural){var im=s.querySelector('.kv-vhero-still');if(im&&!im.complete){v.setAttribute('data-played','');im.addEventListener('load',function(){v.removeAttribute('data-played')})}}
s.setAttribute('data-intro','done');try{localStorage.setItem(${JSON.stringify(INTRO_SEEN_KEY)},String(Date.now()))}catch(e){}}
function key(e){if(e.key==='Escape')finish(false)}
if(!v||!v.play){finish(false);return}
addEventListener('keydown',key);
v.addEventListener('ended',function(){finish(true)});
v.addEventListener('playing',function(){clearTimeout(t0);clearTimeout(stall);if(waitFrom){waited+=Date.now()-waitFrom;waitFrom=0}
if(!started){started=true;cap=setTimeout(function(){finish(false)},((v.duration||7.1)*1000)+2500)}});
v.addEventListener('waiting',function(){if(!started||done)return;waitFrom=Date.now();clearTimeout(stall);stall=setTimeout(function(){finish(false)},Math.max(0,2000-waited))});
v.addEventListener('error',function(){finish(false)},true);
t0=setTimeout(function(){if(!started)finish(false)},3000);safety=setTimeout(function(){finish(false)},15000);
var tall=window.matchMedia&&matchMedia('(orientation: portrait)').matches;
v.muted=true;v.defaultMuted=true;v.poster=tall?'/home/hero/intro-portrait-poster.webp':'/home/hero/intro-poster.webp';v.preload='auto';v.src=tall?'/home/hero/intro-portrait.mp4':'/home/hero/intro.mp4';
try{var p=v.play();if(p&&p.catch)p.catch(function(){finish(false)})}catch(e){finish(false)}})()`;
