import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/*──────────────────────────────────────────────
  HEALIX LANDING PAGE v2
  Spiral intro → Swirl transition → Features
──────────────────────────────────────────────*/

// ─── SPIRAL CANVAS — particles form "HEALIX" then swirl outward ───
function SpiralCanvas({ scrollProgress }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const frameRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let W, H;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sampleText();
    };

    const sampleText = () => {
      const offscreen = document.createElement("canvas");
      const s = Math.min(W, 1200);
      offscreen.width = s;
      offscreen.height = 200;
      const oc = offscreen.getContext("2d");
      const fontSize = Math.min(W * 0.14, 160);
      oc.font = `900 ${fontSize}px 'Outfit', sans-serif`;
      oc.fillStyle = "white";
      oc.textAlign = "center";
      oc.textBaseline = "middle";
      oc.fillText("HEALIX", s / 2, 100);

      const imageData = oc.getImageData(0, 0, s, 200);
      const points = [];
      const gap = 4;
      for (let y = 0; y < 200; y += gap) {
        for (let x = 0; x < s; x += gap) {
          if (imageData.data[(y * s + x) * 4 + 3] > 128) {
            points.push({ x: x - s / 2 + W / 2, y: y - 100 + H / 2 });
          }
        }
      }

      const N = Math.min(points.length, 3500);
      if (particlesRef.current.length === 0) {
        for (let i = 0; i < N; i++) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * Math.max(W, H) * 0.7;
          particlesRef.current.push({
            sx: W / 2 + Math.cos(angle) * r,
            sy: H / 2 + Math.sin(angle) * r,
            tx: points[i % points.length].x,
            ty: points[i % points.length].y,
            x: W / 2 + Math.cos(angle) * r,
            y: H / 2 + Math.sin(angle) * r,
            angle, radius: r,
            speed: 0.3 + Math.random() * 0.7,
            size: 1 + Math.random() * 2.2,
            hue: 190 + Math.random() * 40,
            brightness: 65 + Math.random() * 35,
            spiralSpeed: 0.4 + Math.random() * 1.6,
            spiralPhase: Math.random() * Math.PI * 2,
          });
        }
      } else {
        for (let i = 0; i < particlesRef.current.length; i++) {
          const pt = points[i % points.length];
          particlesRef.current[i].tx = pt.x;
          particlesRef.current[i].ty = pt.y;
        }
      }
    };

    const onMouse = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouse);
    resize();
    window.addEventListener("resize", resize);

    let time = 0;
    const draw = () => {
      time += 0.016;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillRect(0, 0, W, H);

      const sp = scrollProgress.current;
      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let targetX, targetY, alpha;

        if (sp < 0.12) {
          const t = Math.min(sp / 0.12, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          const sa = p.spiralPhase + time * p.spiralSpeed * (1 - ease * 0.8);
          const sr = p.radius * (1 - ease);
          const sx = W / 2 + Math.cos(sa) * sr;
          const sy = H / 2 + Math.sin(sa) * sr;
          targetX = sx + (p.tx - sx) * ease;
          targetY = sy + (p.ty - sy) * ease;
          alpha = 0.4 + ease * 0.6;
        } else if (sp < 0.28) {
          const breathe = Math.sin(time * 2 + i * 0.01) * 2;
          targetX = p.tx + breathe;
          targetY = p.ty + Math.cos(time * 1.5 + i * 0.01) * 1.5;
          alpha = 1;
          const dx = targetX - mx, dy = targetY - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const force = (120 - dist) / 120;
            targetX += dx * force * 0.6;
            targetY += dy * force * 0.6;
          }
        } else if (sp < 0.55) {
          const t = (sp - 0.28) / 0.27;
          const ease = t * t;
          const sa = p.angle + t * Math.PI * 3.5 * (i % 2 === 0 ? 1 : -1);
          const sr = ease * Math.max(W, H) * 0.9;
          targetX = W / 2 + Math.cos(sa) * sr;
          targetY = H / 2 + Math.sin(sa) * sr;
          alpha = 1 - ease * 0.8;
        } else {
          const t2 = (sp - 0.55) / 0.45;
          targetX = W / 2 + Math.cos(p.angle + time * 0.15) * Math.max(W, H);
          targetY = H / 2 + Math.sin(p.angle + time * 0.15) * Math.max(W, H);
          alpha = Math.max(0, 0.2 - t2 * 0.2);
        }

        p.x += (targetX - p.x) * 0.08 * p.speed;
        p.y += (targetY - p.y) * 0.08 * p.speed;

        if (alpha <= 0.01) continue;

        const s = p.size * (sp < 0.28 ? 1 : 1 + Math.max(0, sp - 0.28) * 3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, ${p.brightness}%, ${alpha})`;
        ctx.fill();

        if (p.size > 1.5 && alpha > 0.3) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, s * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 80%, ${p.brightness}%, ${alpha * 0.07})`;
          ctx.fill();
        }
      }

      // Center glow during swirl
      if (sp > 0.2 && sp < 0.6) {
        const ga = sp < 0.35 ? (sp - 0.2) / 0.15 : Math.max(0, 1 - (sp - 0.35) / 0.25);
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 350);
        grad.addColorStop(0, `rgba(56, 182, 255, ${ga * 0.18})`);
        grad.addColorStop(0.4, `rgba(0, 212, 170, ${ga * 0.06})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} />;
}

// ─── Feature Card V2 ───
function FeatureCard({ icon, title, subtitle, desc, gradient, accentColor, delay, visible, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="fc2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        "--accent": accentColor,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(70px)",
        transition: `all 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
      }}
    >
      <div className="fc2-glow" style={{ background: gradient }} />
      <svg className="fc2-circuit" viewBox="0 0 400 300" fill="none" style={{ opacity: hovered ? 0.12 : 0.05 }}>
        <path d="M0 150h80l20-40h80l20 40h200" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
        <path d="M60 0v80l40 20v80l-40 20v100" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
        <circle cx="100" cy="110" r="4" fill="rgba(255,255,255,0.4)"/><circle cx="200" cy="150" r="3" fill="rgba(255,255,255,0.4)"/>
        <circle cx="320" cy="90" r="5" fill="rgba(255,255,255,0.4)"/><circle cx="80" cy="220" r="3" fill="rgba(255,255,255,0.4)"/>
      </svg>

      <div className="fc2-icon-area">
        <div className="fc2-ring" style={{ borderColor: "rgba(255,255,255,0.25)" }}>
          <div className="fc2-ring-inner" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <div className="fc2-icon-bg">{icon}</div>
          </div>
        </div>
        <div className="fc2-orbit" style={{ animationDuration: "10s" }}>
          <div className="fc2-orbit-dot" style={{ background: "rgba(255,255,255,0.6)" }} />
        </div>
        <div className="fc2-orbit" style={{ animationDuration: "14s", animationDirection: "reverse", width: 88, height: 88, marginLeft: -44, marginTop: -44 }}>
          <div className="fc2-orbit-dot" style={{ background: "rgba(255,255,255,0.3)" }} />
        </div>
      </div>

      <div className="fc2-body">
        <div className="fc2-label">{subtitle}</div>
        <h3 className="fc2-title">{title}</h3>
        <p className="fc2-desc">{desc}</p>
        <div className="fc2-ai-tag">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="3" r="1.5" fill="rgba(255,255,255,0.8)" />
            <circle cx="3" cy="7" r="1.5" fill="rgba(255,255,255,0.6)" />
            <circle cx="11" cy="7" r="1.5" fill="rgba(255,255,255,0.6)" />
            <circle cx="7" cy="11" r="1.5" fill="rgba(255,255,255,0.7)" />
            <circle cx="7" cy="7" r="2" fill="rgba(255,255,255,0.9)"/>
            <line x1="7" y1="3" x2="7" y2="7" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
            <line x1="3" y1="7" x2="7" y2="7" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
            <line x1="11" y1="7" x2="7" y2="7" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
            <line x1="7" y1="11" x2="7" y2="7" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          </svg>
          <span>Powered by Qwen AI</span>
        </div>
      </div>

      <div className="fc2-line" style={{ background: "rgba(255,255,255,0.4)", transform: hovered ? "scaleX(1)" : "scaleX(0)" }} />
    </div>
  );
}

// ─── Counter ─── (returns fragment so gradient on parent applies)
function Counter({ target, visible, suffix = "" }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const dur = 2000, start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 4)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [visible, target]);
  return <>{val}{suffix}</>;
}

// ─── Scroll Dots ───
function ScrollDots({ progress }) {
  const items = ["Intro", "Discover", "Features", "Tech"];
  const idx = progress < 0.15 ? 0 : progress < 0.4 ? 1 : progress < 0.7 ? 2 : 3;
  return (
    <div className="sdots">
      {items.map((s, i) => (
        <div key={s} className={`sdot ${i === idx ? "on" : ""}`}>
          <div className="sdot-c" />
          <span className="sdot-l">{s}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Landing ───
export default function HealixLanding() {
  const navigate = useNavigate();
  const scrollProgress = useRef(0);
  const [sp, setSp] = useState(0);
  const [sections, setSections] = useState({});
  const refs = useRef({});

  const obs = useCallback((key, el) => {
    if (el) { refs.current[key] = el; el.dataset.section = key; }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const p = total > 0 ? window.scrollY / total : 0;
      scrollProgress.current = p;
      setSp(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) setSections((s) => ({ ...s, [e.target.dataset.section]: true }));
      }),
      { threshold: 0.1 }
    );
    setTimeout(() => Object.values(refs.current).forEach((el) => observer.observe(el)), 200);

    return () => { window.removeEventListener("scroll", onScroll); observer.disconnect(); };
  }, []);

  // Smooth scroll handler for nav links
  const scrollToSection = (e, sectionId) => {
    e.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const heroOp = sp < 0.1 ? 1 : Math.max(0, 1 - (sp - 0.1) / 0.08);
  const gsOp = sp < 0.15 ? 0 : sp < 0.25 ? (sp - 0.15) / 0.1 : sp < 0.38 ? 1 : Math.max(0, 1 - (sp - 0.38) / 0.1);
  const canvasOp = sp < 0.48 ? 1 : Math.max(0, 1 - (sp - 0.48) / 0.12);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
        :root{--blue:#38B6FF;--deep:#0077CC;--cyan:#00D4AA;--purple:#8B5CF6;--bg:#FAFBFF;--text:#0a0a1a;--soft:#6a6a8a;--dark:#06060f}
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        .hx{font-family:'Outfit',sans-serif;color:#fff;-webkit-font-smoothing:antialiased;background:var(--dark)}

        /* Canvas fade */
        .cfade{position:fixed;inset:0;z-index:1;background:var(--bg);pointer-events:none}

        /* Nav */
        .nav{position:fixed;top:0;left:0;right:0;z-index:200;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;transition:all .5s}
        .nav.dk{background:rgba(6,6,15,.82);backdrop-filter:blur(20px) saturate(1.5);border-bottom:1px solid rgba(255,255,255,.06)}
        .nav.lt{background:rgba(250,251,255,.88);backdrop-filter:blur(20px);border-bottom:1px solid rgba(0,0,0,.06)}
        .nlogo{font-weight:800;font-size:24px;letter-spacing:-.5px;background:linear-gradient(135deg,var(--blue),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:center;gap:10px;cursor:pointer}
        .nlinks{display:flex;gap:36px}
        .nlinks a{font-size:14px;font-weight:500;text-decoration:none;transition:color .3s;cursor:pointer}
        .nav.dk .nlinks a,.nav:not(.dk):not(.lt) .nlinks a{color:rgba(255,255,255,.55)}
        .nav.dk .nlinks a:hover,.nav:not(.dk):not(.lt) .nlinks a:hover{color:#fff}
        .nav.lt .nlinks a{color:var(--soft)}.nav.lt .nlinks a:hover{color:var(--text)}
        .ncta{padding:10px 26px;border-radius:100px;border:none;background:linear-gradient(135deg,var(--blue),var(--deep));color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:'Outfit',sans-serif;box-shadow:0 4px 20px rgba(56,182,255,.3);transition:all .3s}
        .ncta:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(56,182,255,.45)}
        @media(max-width:768px){.nlinks{display:none}}

        /* Hero hint */
        .hhint{position:fixed;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:10vh;pointer-events:none}
        .hscroll{display:flex;flex-direction:column;align-items:center;gap:10px;animation:fu 1s 1.5s ease both;pointer-events:auto}
        .hmouse{width:22px;height:36px;border-radius:11px;border:2px solid rgba(56,182,255,.4);position:relative}
        .hmouse::after{content:'';position:absolute;top:7px;left:50%;transform:translateX(-50%);width:3px;height:7px;border-radius:2px;background:var(--blue);animation:sdb 2s infinite}
        @keyframes sdb{0%{opacity:1;top:7px}100%{opacity:0;top:20px}}
        .hst{font-size:11px;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,.35);font-weight:500}
        @keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}

        /* Get Started */
        .gsov{position:fixed;inset:0;z-index:6;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center;padding:0 24px}
        .gsov>*{pointer-events:auto}
        .gsbadge{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:100px;background:rgba(56,182,255,.08);border:1px solid rgba(56,182,255,.2);font-size:13px;font-weight:600;color:var(--blue);margin-bottom:28px;backdrop-filter:blur(10px)}
        .gsdot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:pd 2s infinite}
        @keyframes pd{0%,100%{transform:scale(1)}50%{transform:scale(1.8);opacity:.5}}
        .gstitle{font-size:clamp(38px,7vw,76px);font-weight:900;line-height:1.05;letter-spacing:-2.5px;margin-bottom:20px}
        .gsgrad{background:linear-gradient(135deg,var(--blue) 0%,var(--cyan) 40%,var(--purple) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-size:200% 200%;animation:gs 5s ease infinite}
        @keyframes gs{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        .gssub{font-size:clamp(15px,2vw,19px);color:rgba(255,255,255,.5);max-width:520px;margin:0 auto 36px;line-height:1.7}
        .gsbtn{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
        .btn1{padding:16px 48px;border-radius:100px;border:none;background:linear-gradient(135deg,var(--blue),var(--deep));color:#fff;font-weight:700;font-size:16px;cursor:pointer;font-family:'Outfit',sans-serif;box-shadow:0 0 40px rgba(56,182,255,.25),0 0 80px rgba(56,182,255,.08);transition:all .4s;position:relative;overflow:hidden}
        .btn1:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 0 60px rgba(56,182,255,.4),0 0 100px rgba(56,182,255,.15)}

        .spacer{height:300vh;position:relative;z-index:0}
        .lcontent{position:relative;z-index:10;background:var(--bg)}

        /* Features */
        .fv2{padding:100px 24px 120px;background:var(--bg)}
        .fhead{text-align:center;margin-bottom:80px}
        .fhead h2{font-size:clamp(32px,5vw,56px);font-weight:900;letter-spacing:-2px;color:var(--text);margin-bottom:16px}
        .fhead p{font-size:18px;color:var(--soft);max-width:480px;margin:0 auto}
        .fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px;max-width:1200px;margin:0 auto}
        @media(max-width:420px){.fgrid{grid-template-columns:1fr}}

        .gradl{background:linear-gradient(135deg,var(--deep) 0%,var(--blue) 40%,var(--cyan) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}

        /* Feature Card V2 */
        .fc2{position:relative;border-radius:24px;padding:44px 36px 40px;cursor:pointer;overflow:hidden;transition:all .6s cubic-bezier(.16,1,.3,1);box-shadow:0 4px 30px rgba(0,0,0,.1);border:1px solid rgba(255,255,255,.15)}
        .fc2:hover{transform:translateY(-12px) scale(1.02);box-shadow:0 30px 80px rgba(0,0,0,.18);border-color:rgba(255,255,255,.4);filter:brightness(1.08)}
        .fc2-glow{position:absolute;inset:0;border-radius:24px;z-index:0;opacity:1}
        .fc2-circuit{position:absolute;inset:0;width:100%;height:100%;transition:opacity .5s;pointer-events:none;z-index:1}
        .fc2-icon-area{position:relative;width:80px;height:80px;margin-bottom:28px;z-index:2}
        .fc2-ring{width:80px;height:80px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center}
        .fc2-ring-inner{width:64px;height:64px;border-radius:50%;border:1px dashed;display:flex;align-items:center;justify-content:center;animation:ss 20s linear infinite}
        @keyframes ss{to{transform:rotate(360deg)}}
        .fc2-icon-bg{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.15);backdrop-filter:blur(8px)}
        .fc2-orbit{position:absolute;top:50%;left:50%;width:76px;height:76px;margin-left:-38px;margin-top:-38px;border-radius:50%;animation:os 10s linear infinite}
        @keyframes os{to{transform:rotate(360deg)}}
        .fc2-orbit-dot{width:5px;height:5px;border-radius:50%;position:absolute;top:-2px;left:50%;margin-left:-2.5px}
        .fc2-body{position:relative;z-index:2}
        .fc2-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;margin-bottom:10px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,.6)}
        .fc2-title{font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px;margin-bottom:12px}
        .fc2-desc{font-size:15px;color:rgba(255,255,255,.8);line-height:1.75;margin-bottom:20px}
        .fc2-ai-tag{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:100px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-size:11px;font-weight:600;color:rgba(255,255,255,.75);font-family:'JetBrains Mono',monospace}
        .fc2-line{position:absolute;bottom:0;left:0;right:0;height:3px;transform-origin:left;transition:transform .5s cubic-bezier(.16,1,.3,1)}

        /* Stats & Tech */
        .stsec{padding:80px 24px;background:var(--dark);position:relative;z-index:10}
        .stgrid{max-width:1000px;margin:0 auto;display:flex;justify-content:center;gap:80px;flex-wrap:wrap}
        .st{text-align:center}
        .stn{font-size:clamp(42px,6vw,64px);font-weight:900;font-family:'JetBrains Mono',monospace;letter-spacing:-2px;background:linear-gradient(135deg,var(--blue),var(--cyan));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--blue)}
        .stl{font-size:12px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:3px;font-weight:600;margin-top:6px}
        .tsec{padding:100px 24px;background:var(--dark);text-align:center;position:relative;z-index:10}
        .tsec h2{font-size:clamp(28px,4vw,44px);font-weight:800;letter-spacing:-1px;margin-bottom:48px}
        .tgrid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:700px;margin:0 auto}
        .tchip{padding:14px 28px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:14px;font-weight:600;color:rgba(255,255,255,.65);font-family:'JetBrains Mono',monospace;transition:all .4s;cursor:default}
        .tchip:hover{background:rgba(56,182,255,.08);border-color:rgba(56,182,255,.3);color:#fff;transform:translateY(-4px);box-shadow:0 8px 30px rgba(56,182,255,.1)}
        .ftr{padding:60px 24px;border-top:1px solid rgba(255,255,255,.06);text-align:center;background:var(--dark);position:relative;z-index:10}
        .ftag{font-size:16px;color:rgba(255,255,255,.35);font-style:italic}
        .ftag strong{background:linear-gradient(135deg,var(--blue),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}

        /* Scroll dots */
        .sdots{position:fixed;right:24px;top:50%;transform:translateY(-50%);z-index:100;display:flex;flex-direction:column;gap:20px}
        .sdot{display:flex;align-items:center;gap:10px;flex-direction:row-reverse}
        .sdot-c{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18);transition:all .4s}
        .sdot.on .sdot-c{background:var(--blue);box-shadow:0 0 12px var(--blue);transform:scale(1.4)}
        .sdot-l{font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600;color:transparent;transition:all .3s}
        .sdot.on .sdot-l{color:rgba(255,255,255,.45)}
        @media(max-width:768px){.sdots{display:none}}
      `}</style>

      <div className="hx">
        <SpiralCanvas scrollProgress={scrollProgress} />
        <div className="cfade" style={{ opacity: 1 - canvasOp }} />

        <nav className={`nav ${sp > 0.05 && sp < 0.5 ? "dk" : ""} ${sp >= 0.5 ? "lt" : ""}`}>
          <div className="nlogo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" fill="url(#g1)"/>
              <path d="M14 8v12M8 11v6M20 11v6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <defs><linearGradient id="g1" x1="2" y1="2" x2="26" y2="26"><stop stopColor="#38B6FF"/><stop offset="1" stopColor="#00D4AA"/></linearGradient></defs>
            </svg>
            Healix
          </div>
          <div className="nlinks">
            <a href="#features" onClick={(e) => scrollToSection(e, "features")}>Features</a>
            <a href="#tech" onClick={(e) => scrollToSection(e, "tech")}>Stack</a>
            <a href="#about" onClick={(e) => scrollToSection(e, "about")}>About</a>
          </div>
          <button className="ncta" onClick={() => navigate("/labs")}>Get Started</button>
        </nav>

        <ScrollDots progress={sp} />

        <div className="hhint" style={{ opacity: heroOp, pointerEvents: heroOp > 0.5 ? "auto" : "none" }}>
          <div className="hscroll">
            <div className="hmouse" />
            <span className="hst">Scroll to explore</span>
          </div>
        </div>

        <div className="gsov" style={{
          opacity: gsOp,
          pointerEvents: gsOp > 0.5 ? "auto" : "none",
          transform: `scale(${0.94 + gsOp * 0.06})`,
          transition: "transform .3s",
        }}>
          <div className="gsbadge"><div className="gsdot" />Qwen AI Build Day 2026</div>
          <h1 className="gstitle">
            Health Intelligence<br /><span className="gsgrad">Made Clear</span>
          </h1>
          <p className="gssub">Three AI tools. One platform. Transform lab reports, consultations, and body scans into insights anyone can understand.</p>
          <div className="gsbtn">
            <button className="btn1" onClick={() => navigate("/labs")}>Try Healix Now</button>
          </div>
        </div>

        <div className="spacer" />

        <div className="lcontent">
          <svg viewBox="0 0 1440 120" fill="none" style={{ display: "block", width: "100%", marginBottom: -2, position: "relative", zIndex: 10 }}>
            <path d="M0 120V60C240 20 480 0 720 20C960 40 1200 80 1440 60V120H0Z" fill="var(--bg)" />
          </svg>

          <section className="fv2" id="features" ref={(el) => obs("features", el)}>
            <div className="fhead">
              <h2>Three AI Tools.<br /><span className="gradl">Zero Medical Jargon.</span></h2>
              <p>Every output at an 8th-grade reading level. Built for 30+ countries.</p>
            </div>
            <div className="fgrid">
              <FeatureCard
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="7" y="2" width="10" height="4" rx="1"/><rect x="3" y="8" width="18" height="14" rx="2"/><path d="M12 12v5M8 12v3M16 12v3"/></svg>}
                title="Labs Analyzer"
                subtitle="Vision AI · NLP"
                desc="Drop any lab report PDF in EN, FR, AR, or VN. Vision model extracts every test, classifies severity across 5 tiers, and generates plain-language explanations with next steps."
                gradient="linear-gradient(135deg,#38B6FF,#0077CC)"
                accentColor="#38B6FF" delay={0} visible={sections.features}
                onClick={() => navigate("/labs")}
              />
              <FeatureCard
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><path d="M8 22h8"/></svg>}
                title="Clinical Scribe"
                subtitle="Audio AI · Clinical NLP"
                desc="Upload a consultation recording. AI transcribes across 4 languages, identifies symptoms and medications, then generates a structured SOAP note — saving doctors 10-15 hours weekly."
                gradient="linear-gradient(135deg,#00D4AA,#00996B)"
                accentColor="#00D4AA" delay={0.15} visible={sections.features}
                onClick={() => navigate("/scribe")}
              />
              <FeatureCard
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.5 8.5 0 0113 0"/><path d="M12 11v4M10 13h4"/></svg>}
                title="Body Scan"
                subtitle="Computer Vision · Robotics"
                desc="Capture front and side body photos — guided by voice assistant. AI estimates 22 body measurements and calculates body fat using the U.S. Navy Method with BMI cross-validation."
                gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
                accentColor="#8B5CF6" delay={0.3} visible={sections.features}
                onClick={() => navigate("/bodyscan")}
              />
            </div>
          </section>
        </div>

        <div style={{ position: "relative", zIndex: 10 }}>
          <svg viewBox="0 0 1440 120" fill="none" style={{ display: "block", width: "100%", marginBottom: -2 }}>
            <path d="M0 0V60C240 100 480 120 720 100C960 80 1200 40 1440 60V0H0Z" fill="var(--bg)" />
          </svg>
        </div>

        <section className="stsec" ref={(el) => obs("stats", el)}>
          <div className="stgrid">
            {[{ n: 4, s: "", l: "Languages" }, { n: 3, s: "", l: "AI Tools" }, { n: 6, s: "", l: "Days Built" }, { n: 30, s: "+", l: "Countries" }].map((d, i) => (
              <div key={i} className="st">
                <div className="stn"><Counter target={d.n} visible={sections.stats} suffix={d.s} /></div>
                <div className="stl">{d.l}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="tsec" id="tech" ref={(el) => obs("tech", el)}>
          <h2>Built With <span className="gsgrad">Cutting-Edge AI</span></h2>
          <div className="tgrid">
            {["Qwen-VL", "Qwen-Max", "Dashscope API", "Alibaba Cloud", "Google Speech", "FastAPI", "React 19", "Vite", "PyMuPDF"].map((t, i) => (
              <div key={t} className="tchip" style={{
                opacity: sections.tech ? 1 : 0,
                transform: sections.tech ? "translateY(0)" : "translateY(20px)",
                transition: `all .5s ease ${i * 0.07}s`,
              }}>{t}</div>
            ))}
          </div>
        </section>

        <footer className="ftr" id="about">
          <p className="ftag"><strong>Healix</strong> — because health data should heal, not confuse.</p>
          <p style={{ color: "rgba(255,255,255,.25)", fontSize: 13, marginTop: 12 }}>
            Built by 4 builders · Elfie Healthcare Track · Qwen AI Build Day Vietnam 2026
          </p>
        </footer>
      </div>
    </>
  );
}