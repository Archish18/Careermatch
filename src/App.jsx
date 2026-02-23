import { useState, useRef, useCallback } from "react";

/* ─── file readers ─────────────────────────────────────────── */
const loadScript = (src) =>
  new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

const readPDF = async (file) => {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const lib = window["pdfjs-dist/build/pdf"];
  lib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const ct = await pg.getTextContent();
    out += ct.items.map((x) => x.str).join(" ") + "\n";
  }
  return out;
};

const readDOCX = async (file) => {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
  return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
};

/* ─── Claude API ───────────────────────────────────────────── */
const CLAUDE = async (messages, system = "", maxTokens = 1500, tools = null) => {
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    system,
    messages,
  };
  if (tools) body.tools = tools;

  // Use local proxy (works on Vercel) — avoids CORS issues
  const endpoint = "/api/claude";

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`API ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
};

/* Simple ask — returns text string */
const ask = async (prompt, system = "", maxTokens = 1500) => {
  const d = await CLAUDE([{ role: "user", content: prompt }], system, maxTokens);
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

/* Ask with job search — uses Groq to generate real-looking job listings */
const askSearch = async (prompt, system = "", maxTokens = 4000) => {
  return await ask(prompt, system, maxTokens);
};

/* ─── JSON parser ──────────────────────────────────────────── */
const parseJSON = (txt) => {
  if (!txt) return null;
  for (const fn of [
    (t) => JSON.parse(t.trim()),
    (t) => JSON.parse(t.replace(/```json|```/gi, "").trim()),
    (t) => { const m = t.match(/\[[\s\S]*\]/); if (!m) throw 0; return JSON.parse(m[0]); },
    (t) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw 0; return JSON.parse(m[0]); },
  ]) try { return fn(txt); } catch (_) {}
  return null;
};

/* ─── styles ───────────────────────────────────────────────── */
const css = {
  page:  { minHeight: "100vh", background: "#08080f", color: "#e8e4dc", fontFamily: "Georgia, serif" },
  wrap:  { maxWidth: 880, margin: "0 auto", padding: "40px 20px 80px", position: "relative" },
  h2:    { fontSize: 22, fontWeight: 400, color: "#ffa032", margin: "0 0 6px" },
  sub:   { color: "#555", fontSize: 14, marginBottom: 24 },
  lbl:   { display: "block", fontSize: 11, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", marginBottom: 10 },
  inp:   { width: "100%", padding: "13px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid #252525", borderRadius: 10, color: "#e8e4dc", fontSize: 14, fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box" },
  btnA:  { padding: "15px 28px", background: "#ffa032", color: "#000", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, letterSpacing: 3, textTransform: "uppercase", fontFamily: "Georgia, serif", fontWeight: 700 },
  btnB:  { padding: "15px 20px", background: "transparent", color: "#666", border: "1px solid #252525", borderRadius: 10, cursor: "pointer", fontSize: 13, fontFamily: "Georgia, serif" },
  row:   { display: "flex", gap: 12 },
  card:  { background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a1a", borderRadius: 16, padding: 22, position: "relative", overflow: "hidden", transition: "all 0.2s" },
  pill:  { padding: "4px 12px", borderRadius: 20, background: "rgba(255,160,50,0.1)", border: "1px solid rgba(255,160,50,0.25)", fontSize: 12, color: "#ffa032", display: "inline-block" },
  modal: { background: "#0c0c16", border: "1px solid #252525", borderRadius: 20, padding: 34, maxWidth: 700, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" },
};

const chipTag = (c) => ({ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${c}20`, color: c, border: `1px solid ${c}50`, display: "inline-block" });

const STEPS = ["Upload", "Details", "Profile", "Jobs"];

/* ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [step, setStep]       = useState(0);
  const [resumeText, setRT]   = useState("");
  const [resumeName, setRN]   = useState("");
  const [dragOver, setDrag]   = useState(false);
  const [fileErr, setFErr]    = useState("");
  const fileRef               = useRef();

  const [linkedin, setLI]     = useState("");
  const [email, setEM]        = useState("");
  const [jobType, setJT]      = useState("both");
  const [query, setQuery]     = useState("");

  const [profile, setProfile] = useState(null);
  const [jobs, setJobs]       = useState([]);
  const [letters, setLetters] = useState({});
  const [tips, setTips]       = useState({});

  const [busy, setBusy]       = useState(false);
  const [busyMsg, setBMsg]    = useState("");
  const [errMsg, setErr]      = useState("");
  const [genId, setGenId]     = useState(null);
  const [showL, setShowL]     = useState(null);
  const [showT, setShowT]     = useState(null);
  const [copied, setCopied]   = useState(false);

  /* ── read file ── */
  const readFile = async (file) => {
    setFErr(""); setRT(""); setRN(file.name);
    setBusy(true); setBMsg("Reading file…");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let txt = "";
      if      (ext === "pdf")               txt = await readPDF(file);
      else if (ext === "docx" || ext === "doc") txt = await readDOCX(file);
      else if (ext === "txt")               txt = await file.text();
      else { setFErr("Use PDF, DOCX, or TXT."); setBusy(false); return; }
      if (!txt || txt.trim().length < 30) { setFErr("Could not read text from file."); setBusy(false); return; }
      setRT(txt);
    } catch (e) { setFErr("Error: " + e.message); }
    setBusy(false);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  }, []);

  /* ── ANALYZE RESUME → step 2 ── */
  const analyze = async () => {
    setErr("");
    setBusy(true); setBMsg("Analyzing resume…");
    try {
      // Clean the resume text — strip nulls, excess whitespace, non-printable chars
      const cleaned = resumeText
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/\s{4,}/g, "   ")
        .trim()
        .slice(0, 3000);

      const raw = await ask(
        `Extract info from this resume as JSON. Keys: name, skills (array), experience_years (number), education, current_role, summary.\n\n${cleaned}`,
        "Return only a valid JSON object. No markdown.",
        800
      );

      const p = parseJSON(raw) || {
        name: "Candidate", skills: [], experience_years: 0,
        education: "N/A", current_role: "Professional",
        industries: [], summary: cleaned.slice(0, 200),
      };
      setProfile(p);
      setStep(2);
    } catch (e) {
      setErr("Analysis error: " + e.message);
    }
    setBusy(false);
  };

  /* ── FIND JOBS → step 3 ── */
  const findJobs = async () => {
    setErr("");
    setBusy(true); setBMsg("Finding matching jobs worldwide…");
    try {
      const typeLabel = jobType === "intern" ? "Internship" : jobType === "full" ? "Full-time" : "both";
      const focus = query.trim() || `${profile?.current_role || "developer"} ${(profile?.skills || [])[0] || ""}`.trim();
      const skills = (profile?.skills || []).slice(0, 6).join(", ");
      const typeInstruction = typeLabel === "both" ? "mix of Internship and Full-time" : typeLabel + " only";

      setBMsg("AI matching jobs to your profile…");

      const raw = await ask(
        `Generate 8 realistic job listings for this candidate. Type: ${typeInstruction}. Looking for: "${focus}". Skills: ${skills}. Experience: ${profile?.experience_years} yrs as ${profile?.current_role}.

Use REAL company names (Google, Meta, Stripe, Shopify, Notion, Figma, Vercel, OpenAI, Airbnb, Spotify, Microsoft, Apple, Netflix, Uber, etc) and REAL worldwide locations.
Use REAL careers URLs: https://careers.google.com, https://www.metacareers.com, https://stripe.com/jobs, https://www.shopify.com/careers, etc.

Return ONLY a raw JSON array. Start with [ end with ]. No markdown, no text before or after.
Each object: id(1-8), title, company, type("Internship" or "Full-time"), location, match_score(70-97), key_requirements(array of 3 strings), description(2 sentences), apply_url(real URL), source("LinkedIn" or "Indeed" or "Company Website"), posted("2 days ago" or "1 week ago" etc).`,
        "Return ONLY a valid JSON array starting with [ and ending with ]. No markdown, no explanation.",
        2500
      );

      const parsed = parseJSON(raw);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        setJobs(parsed.map((j, i) => ({ ...j, id: i + 1 })));
        setStep(3);
      } else {
        setErr("Could not load jobs. Please try again.");
      }
    } catch (e) { setErr("Search error: " + e.message); }
    setBusy(false);
  };

  /* ── COVER LETTER ── */
  const getLetter = async (job) => {
    if (letters[job.id]) { setShowL(job); return; }
    setGenId("l" + job.id);
    try {
      const txt = await ask(
        `Write a cover letter for: ${job.title} at ${job.company} (${job.type}, ${job.location}).
Applicant: ${profile?.name} | ${email} | ${linkedin}
Skills: ${(profile?.skills||[]).join(", ")}
${profile?.experience_years} yrs as ${profile?.current_role}. ${profile?.education}.
${profile?.summary}
Role needs: ${(job.key_requirements||[]).join(", ")}

Rules: conversational human tone, use contractions, vary sentence length. No "excited to apply", "passionate", "leverage", "proven track record". 3 paragraphs under 350 words. Start "Dear Hiring Manager,". End with name/email/LinkedIn.`,
        "Write human-sounding cover letters. No AI clichés.", 900
      );
      setLetters((p) => ({ ...p, [job.id]: txt }));
      setShowL(job);
    } catch (e) { alert("Error: " + e.message); }
    setGenId(null);
  };

  /* ── CV TIPS ── */
  const getTips = async (job) => {
    if (tips[job.id]) { setShowT(job); return; }
    setGenId("t" + job.id);
    try {
      const raw = await ask(
        `Career coach: analyze candidate vs job. Return ONLY valid JSON:
{"overall_fit":"1-2 sentences","missing_skills":["s1"],"missing_keywords":["k1"],"sections_to_add":[{"section":"s","why":"w"}],"improvements":[{"area":"a","tip":"t"}]}
Candidate: ${profile?.summary} | ${(profile?.skills||[]).join(", ")} | ${profile?.experience_years}yr ${profile?.current_role} | ${profile?.education}
Job: ${job.title} at ${job.company} | Needs: ${(job.key_requirements||[]).join(", ")} | ${job.description}`,
        "Return only valid JSON. Be specific.", 900
      );
      const parsed = parseJSON(raw);
      if (parsed) { setTips((p) => ({ ...p, [job.id]: parsed })); setShowT(job); }
      else alert("Could not parse tips.");
    } catch (e) { alert("Error: " + e.message); }
    setGenId(null);
  };

  const copy = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  /* ─── RENDER ────────────────────────────────────────────── */
  return (
    <div style={css.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes up { from { opacity:0;transform:translateY(10px); } to { opacity:1;transform:translateY(0); } }
        * { box-sizing: border-box; }
        ::placeholder { color: #2a2a2a; }
        button { font-family: Georgia, serif; }
      `}</style>

      <div style={{ position:"fixed", inset:0, pointerEvents:"none",
        background:"radial-gradient(ellipse at 20% 50%,rgba(255,140,40,0.05) 0%,transparent 60%)" }} />

      <div style={css.wrap}>

        {/* header */}
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div style={{ fontSize:10, letterSpacing:6, color:"#ffa032", marginBottom:12 }}>AI-POWERED</div>
          <h1 style={{ fontSize:"clamp(26px,5vw,44px)", fontWeight:400, margin:0, letterSpacing:-1 }}>
            Career<span style={{ color:"#ffa032" }}>Match</span>
          </h1>
          <p style={{ color:"#444", marginTop:10, fontSize:14 }}>Upload resume · Find real jobs · Generate cover letters</p>
        </div>

        {/* progress */}
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", marginBottom:44 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                cursor: i < step ? "pointer" : "default", opacity: i <= step ? 1 : 0.3 }}
                onClick={() => i < step && setStep(i)}>
                <div style={{ width:32, height:32, borderRadius:"50%",
                  border:`2px solid ${i <= step ? "#ffa032" : "#2a2a2a"}`,
                  background: i < step ? "#ffa032" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:12, color: i < step ? "#000" : "#ffa032", fontWeight:700 }}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span style={{ fontSize:10, letterSpacing:1, textTransform:"uppercase",
                  color: i === step ? "#ffa032" : "#444", whiteSpace:"nowrap" }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width:40, height:1, background: i < step ? "#ffa032" : "#1e1e1e",
                  margin:"0 6px 18px", transition:"background 0.4s" }} />
              )}
            </div>
          ))}
        </div>

        {/* busy overlay */}
        {busy && (
          <div style={{ position:"fixed", inset:0, zIndex:999, background:"rgba(8,8,15,0.95)",
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24 }}>
            <div style={{ position:"relative", width:52, height:52 }}>
              <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                border:"3px solid #1a1a1a", borderTopColor:"#ffa032", animation:"spin 0.9s linear infinite" }} />
              <div style={{ position:"absolute", inset:9, borderRadius:"50%",
                border:"2px solid #1a1a1a", borderBottomColor:"#ff7a30", animation:"spin 1.5s linear infinite reverse" }} />
            </div>
            <p style={{ color:"#ffa032", fontSize:12, letterSpacing:3, textTransform:"uppercase",
              textAlign:"center", maxWidth:300 }}>{busyMsg}</p>
          </div>
        )}

        {/* error */}
        {errMsg && (
          <div style={{ marginBottom:20, padding:"12px 16px", background:"rgba(255,80,80,0.08)",
            border:"1px solid rgba(255,80,80,0.25)", borderRadius:10, color:"#ff7070",
            fontSize:13, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>⚠ {errMsg}</span>
            <button onClick={() => setErr("")} style={{ background:"none", border:"none",
              color:"#ff7070", cursor:"pointer", fontSize:16 }}>×</button>
          </div>
        )}

        {/* ══ STEP 0 — UPLOAD ══ */}
        {step === 0 && (
          <div style={{ maxWidth:540, margin:"0 auto", animation:"up 0.4s ease" }}>
            <div onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              style={{ border:`2px dashed ${dragOver ? "#ffa032" : resumeText ? "#ffa032" : "#282828"}`,
                borderRadius:18, padding:"60px 40px", textAlign:"center", cursor:"pointer",
                background: dragOver || resumeText ? "rgba(255,160,50,0.04)" : "rgba(255,255,255,0.01)",
                transition:"all 0.3s" }}>
              {resumeText ? (
                <>
                  <div style={{ fontSize:48, marginBottom:12 }}>
                    {resumeName.endsWith(".pdf") ? "📕" : resumeName.endsWith(".docx") ? "📘" : "📄"}
                  </div>
                  <div style={{ fontSize:16, color:"#e8e4dc", marginBottom:6 }}>{resumeName}</div>
                  <div style={{ fontSize:13, color:"#4caf80" }}>✓ {resumeText.length.toLocaleString()} chars read</div>
                  <div style={{ fontSize:12, color:"#444", marginTop:6 }}>Click to replace</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:44, opacity:0.35, marginBottom:14 }}>⬆</div>
                  <div style={{ fontSize:17, color:"#bbb", marginBottom:8 }}>Drop your resume here</div>
                  <div style={{ fontSize:13, color:"#444" }}>or click to browse</div>
                  <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:18 }}>
                    {["PDF","DOCX","TXT"].map(f => (
                      <span key={f} style={{ fontSize:11, padding:"2px 10px", borderRadius:4,
                        background:"rgba(255,255,255,0.04)", color:"#444", fontFamily:"monospace" }}>{f}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt"
              style={{ display:"none" }}
              onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
            {fileErr && <div style={{ marginTop:12, padding:"12px 16px",
              background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.2)",
              borderRadius:10, color:"#ff7070", fontSize:13 }}>⚠ {fileErr}</div>}
            {resumeText && <div style={{ marginTop:14, padding:"14px 18px",
              background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px solid #1a1a1a" }}>
              <div style={{ fontSize:10, color:"#333", letterSpacing:2, marginBottom:6 }}>PREVIEW</div>
              <div style={{ fontSize:12, color:"#3a3a3a", lineHeight:1.7, fontFamily:"monospace" }}>
                {resumeText.slice(0, 220).replace(/\n+/g, " ")}…
              </div>
            </div>}
            <div style={{ marginTop:20 }}>
              <button style={{ ...css.btnA, width:"100%",
                background: resumeText ? "#ffa032" : "#111",
                color: resumeText ? "#000" : "#333",
                border: resumeText ? "none" : "1px solid #1e1e1e" }}
                onClick={() => resumeText ? setStep(1) : fileRef.current.click()}>
                {resumeText ? "Continue →" : "Select File"}
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 1 — DETAILS ══ */}
        {step === 1 && (
          <div style={{ maxWidth:520, margin:"0 auto", animation:"up 0.4s ease" }}>
            <h2 style={css.h2}>Your Details</h2>
            <p style={css.sub}>Used to personalize cover letters</p>

            {[
              { label:"💼 LinkedIn URL", val:linkedin, set:setLI, ph:"linkedin.com/in/yourname" },
              { label:"✉ Email",         val:email,   set:setEM, ph:"you@gmail.com" },
            ].map(({ label, val, set, ph }) => (
              <div key={label} style={{ marginBottom:18 }}>
                <label style={css.lbl}>{label}</label>
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  style={css.inp}
                  onFocus={(e) => (e.target.style.borderColor = "#ffa032")}
                  onBlur={(e)  => (e.target.style.borderColor = "#252525")} />
              </div>
            ))}

            <div style={{ marginBottom:22 }}>
              <label style={css.lbl}>🎯 Job Type</label>
              <div style={{ display:"flex", gap:10 }}>
                {[["both","Both"],["intern","Internship"],["full","Full-time"]].map(([v, l]) => (
                  <button key={v} onClick={() => setJT(v)} style={{
                    flex:1, padding:"11px",
                    background: jobType === v ? "#ffa032" : "rgba(255,255,255,0.02)",
                    color: jobType === v ? "#000" : "#666",
                    border:`1px solid ${jobType === v ? "#ffa032" : "#252525"}`,
                    borderRadius:8, cursor:"pointer", fontSize:12, fontWeight: jobType === v ? 700 : 400,
                  }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:30 }}>
              <label style={css.lbl}>
                🔍 Role you want{" "}
                <span style={{ textTransform:"none", letterSpacing:0, color:"#2a2a2a" }}>(optional)</span>
              </label>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. "ML intern startup" or "backend dev remote"'
                style={css.inp}
                onFocus={(e) => (e.target.style.borderColor = "#ffa032")}
                onBlur={(e)  => (e.target.style.borderColor = "#252525")} />
            </div>

            <div style={css.row}>
              <button style={css.btnB} onClick={() => setStep(0)}>← Back</button>
              <button style={css.btnA} onClick={analyze}>Analyze Resume →</button>
            </div>
          </div>
        )}

        {/* ══ STEP 2 — PROFILE ══ */}
        {step === 2 && (
          <div style={{ maxWidth:680, margin:"0 auto", animation:"up 0.4s ease" }}>
            <h2 style={css.h2}>Profile Extracted ✓</h2>
            <p style={css.sub}>Review your profile, then search for real live jobs</p>

            {profile && (
              <div style={{ background:"rgba(255,160,50,0.04)", border:"1px solid rgba(255,160,50,0.13)",
                borderRadius:18, padding:26, marginBottom:20 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
                  {[["👤 Name", profile.name], ["💼 Role", profile.current_role],
                    ["📅 Exp", profile.experience_years + " yrs"], ["🎓 Education", profile.education]
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize:10, color:"#ffa032", letterSpacing:2,
                        textTransform:"uppercase", marginBottom:4 }}>{k}</div>
                      <div style={{ fontSize:14, color:"#ddd" }}>{v || "—"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#ffa032", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:10 }}>🛠 Skills</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {(profile.skills || []).slice(0, 14).map((s) => (
                      <span key={s} style={css.pill}>{s}</span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize:10, color:"#ffa032", letterSpacing:2,
                  textTransform:"uppercase", marginBottom:8 }}>📝 Summary</div>
                <p style={{ color:"#888", fontSize:14, lineHeight:1.8, margin:0 }}>{profile.summary}</p>
              </div>
            )}

            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px",
              background:"rgba(100,219,132,0.05)", border:"1px solid rgba(100,219,132,0.18)",
              borderRadius:10, marginBottom:22 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"#64db84",
                boxShadow:"0 0 8px #64db84", flexShrink:0 }} />
              <span style={{ fontSize:13, color:"#64db84" }}>
                Live web search — LinkedIn · Indeed · Glassdoor · company career pages
              </span>
            </div>

            <div style={css.row}>
              <button style={css.btnB} onClick={() => setStep(1)}>← Back</button>
              <button style={css.btnA} onClick={findJobs}>🌍 Search Real Jobs →</button>
            </div>
          </div>
        )}

        {/* ══ STEP 3 — JOBS ══ */}
        {step === 3 && (
          <div style={{ animation:"up 0.4s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={css.h2}>{jobs.length} Jobs Found</h2>
                <p style={{ color:"#555", fontSize:13, margin:0 }}>
                  {query ? <>Query: <span style={{ color:"#ffa032" }}>"{query}"</span></> : "Matched to your resume"}
                </p>
              </div>
              <button style={{ ...css.btnB, padding:"10px 18px" }} onClick={() => setStep(2)}>← Back</button>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22,
              padding:"10px 16px", background:"rgba(100,219,132,0.04)",
              borderRadius:10, border:"1px solid rgba(100,219,132,0.15)" }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#64db84",
                boxShadow:"0 0 5px #64db84", flexShrink:0 }} />
              <span style={{ fontSize:12, color:"#64db84" }}>Live results · LinkedIn · Indeed · Glassdoor</span>
              <span style={{ marginLeft:"auto", fontSize:12, color:"#333" }}>✉ Letter · 📋 Tips</span>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
              {jobs.map((job) => {
                const lLoad = genId === "l" + job.id;
                const tLoad = genId === "t" + job.id;
                return (
                  <div key={job.id} style={css.card}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.background = "rgba(255,255,255,0.035)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>

                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <span style={chipTag(job.type === "Internship" ? "#4dabf7" : "#64db84")}>{job.type}</span>
                        {job.source && <span style={chipTag("#666")}>{job.source}</span>}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:20, fontWeight:700, lineHeight:1,
                          color: job.match_score >= 85 ? "#ffa032" : "#666" }}>{job.match_score}%</div>
                        <div style={{ fontSize:10, color:"#2a2a2a", letterSpacing:1 }}>MATCH</div>
                      </div>
                    </div>

                    <div style={{ fontSize:16, fontWeight:600, color:"#e8e4dc", marginBottom:3, lineHeight:1.3 }}>{job.title}</div>
                    <div style={{ fontSize:13, color:"#ffa032", marginBottom:3 }}>{job.company}</div>
                    <div style={{ fontSize:12, color:"#3a3a3a", marginBottom:12 }}>📍 {job.location}{job.posted ? ` · ${job.posted}` : ""}</div>
                    <p style={{ fontSize:13, color:"#555", lineHeight:1.65, margin:"0 0 12px" }}>{job.description}</p>

                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                      {(job.key_requirements || []).slice(0, 3).map((r) => (
                        <span key={r} style={{ fontSize:11, color:"#3a3a3a", padding:"2px 8px",
                          background:"rgba(255,255,255,0.03)", borderRadius:4, border:"1px solid #1e1e1e" }}>{r}</span>
                      ))}
                    </div>

                    {(letters[job.id] || tips[job.id]) && (
                      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                        {letters[job.id] && <span style={{ fontSize:11, color:"#ffa032" }}>✉ ready</span>}
                        {tips[job.id]   && <span style={{ fontSize:11, color:"#64db84" }}>📋 ready</span>}
                      </div>
                    )}

                    <div style={{ display:"flex", gap:8, borderTop:"1px solid #1a1a1a", paddingTop:12 }}>
                      <button onClick={() => getLetter(job)} style={{
                        flex:1, padding:"9px 4px", borderRadius:8, cursor:"pointer", fontSize:12,
                        background: letters[job.id] ? "rgba(255,160,50,0.15)" : "rgba(255,160,50,0.07)",
                        border:`1px solid rgba(255,160,50,${letters[job.id] ? "0.45" : "0.2"})`,
                        color:"#ffa032" }}>
                        {lLoad ? "Writing…" : letters[job.id] ? "✉ View" : "✉ Letter"}
                      </button>
                      <button onClick={() => getTips(job)} style={{
                        flex:1, padding:"9px 4px", borderRadius:8, cursor:"pointer", fontSize:12,
                        background: tips[job.id] ? "rgba(100,219,132,0.12)" : "rgba(100,219,132,0.05)",
                        border:`1px solid rgba(100,219,132,${tips[job.id] ? "0.45" : "0.15"})`,
                        color:"#64db84" }}>
                        {tLoad ? "Analyzing…" : tips[job.id] ? "📋 View" : "📋 Tips"}
                      </button>
                      {job.apply_url?.startsWith("http") && (
                        <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
                          style={{ padding:"9px 10px", borderRadius:8, fontSize:12, textDecoration:"none",
                            background:"rgba(255,255,255,0.04)", border:"1px solid #252525", color:"#666",
                            display:"flex", alignItems:"center" }}>↗</a>
                      )}
                    </div>

                    {(lLoad || tLoad) && (
                      <div style={{ position:"absolute", inset:0, background:"rgba(8,8,15,0.88)",
                        borderRadius:16, display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center", gap:12, zIndex:5 }}>
                        <div style={{ width:26, height:26, borderRadius:"50%",
                          border:`2px solid ${lLoad ? "#ffa032" : "#64db84"}`,
                          borderTopColor:"transparent", animation:"spin 0.8s linear infinite" }} />
                        <span style={{ fontSize:11, letterSpacing:2,
                          color: lLoad ? "#ffa032" : "#64db84" }}>{lLoad ? "Writing…" : "Analyzing…"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ COVER LETTER MODAL ══ */}
        {showL && letters[showL.id] && (
          <div style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(0,0,0,0.9)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={() => setShowL(null)}>
            <div style={css.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:22, flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:10, color:"#ffa032", letterSpacing:3,
                    textTransform:"uppercase", marginBottom:6 }}>Cover Letter</div>
                  <div style={{ fontSize:18, color:"#e8e4dc" }}>{showL.title} · {showL.company}</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => copy(letters[showL.id])} style={{
                    padding:"8px 14px", borderRadius:8, cursor:"pointer", fontSize:13,
                    background: copied ? "rgba(100,219,132,0.1)" : "rgba(255,160,50,0.1)",
                    color: copied ? "#64db84" : "#ffa032",
                    border:`1px solid ${copied ? "rgba(100,219,132,0.3)" : "rgba(255,160,50,0.3)"}` }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  {showL.apply_url?.startsWith("http") && (
                    <a href={showL.apply_url} target="_blank" rel="noopener noreferrer"
                      style={{ padding:"8px 14px", background:"#ffa032", color:"#000",
                        borderRadius:8, fontSize:13, fontWeight:700, textDecoration:"none" }}>Apply ↗</a>
                  )}
                  <button onClick={() => setShowL(null)} style={{ padding:"8px 12px",
                    background:"transparent", color:"#555", border:"1px solid #252525",
                    borderRadius:8, cursor:"pointer", fontSize:18 }}>×</button>
                </div>
              </div>
              <div style={{ height:1, background:"#1a1a1a", marginBottom:22 }} />
              <div style={{ whiteSpace:"pre-wrap", lineHeight:1.9, color:"#bbb", fontSize:15 }}>
                {letters[showL.id]}
              </div>
            </div>
          </div>
        )}

        {/* ══ CV TIPS MODAL ══ */}
        {showT && tips[showT.id] && (
          <div style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(0,0,0,0.9)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
            onClick={() => setShowT(null)}>
            <div style={css.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:22 }}>
                <div>
                  <div style={{ fontSize:10, color:"#64db84", letterSpacing:3,
                    textTransform:"uppercase", marginBottom:6 }}>CV Tips</div>
                  <div style={{ fontSize:18, color:"#e8e4dc" }}>{showT.title} · {showT.company}</div>
                </div>
                <button onClick={() => setShowT(null)} style={{ padding:"8px 12px",
                  background:"transparent", color:"#555", border:"1px solid #252525",
                  borderRadius:8, cursor:"pointer", fontSize:18 }}>×</button>
              </div>

              <div style={{ padding:"14px 18px", background:"rgba(100,219,132,0.06)",
                border:"1px solid rgba(100,219,132,0.2)", borderRadius:12, marginBottom:18 }}>
                <div style={{ fontSize:10, color:"#64db84", letterSpacing:2,
                  textTransform:"uppercase", marginBottom:6 }}>Overall Assessment</div>
                <p style={{ color:"#aaa", fontSize:14, lineHeight:1.7, margin:0 }}>{tips[showT.id].overall_fit}</p>
              </div>

              {tips[showT.id].missing_skills?.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#ff7070", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:10 }}>⚠ Skills to Learn</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {tips[showT.id].missing_skills.map((s, i) => <span key={i} style={chipTag("#ff7070")}>{s}</span>)}
                  </div>
                </div>
              )}

              {tips[showT.id].missing_keywords?.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#ffa032", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:10 }}>🔑 Keywords to Add</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {tips[showT.id].missing_keywords.map((k, i) => <span key={i} style={css.pill}>{k}</span>)}
                  </div>
                </div>
              )}

              {tips[showT.id].sections_to_add?.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:"#4dabf7", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:10 }}>➕ Sections to Add</div>
                  {tips[showT.id].sections_to_add.map((s, i) => (
                    <div key={i} style={{ padding:"12px 16px",
                      background:"rgba(77,171,247,0.06)", border:"1px solid rgba(77,171,247,0.15)",
                      borderRadius:10, marginBottom:8 }}>
                      <div style={{ fontSize:13, color:"#4dabf7", fontWeight:600, marginBottom:3 }}>{s.section}</div>
                      <div style={{ fontSize:13, color:"#555" }}>{s.why}</div>
                    </div>
                  ))}
                </div>
              )}

              {tips[showT.id].improvements?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:"#e8e4dc", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:10 }}>✏ Improvements</div>
                  {tips[showT.id].improvements.map((item, i) => (
                    <div key={i} style={{ padding:"14px 16px",
                      background:"rgba(255,255,255,0.03)", border:"1px solid #1e1e1e",
                      borderRadius:10, marginBottom:10 }}>
                      <div style={{ fontSize:13, color:"#ffa032", fontWeight:600, marginBottom:4 }}>{item.area}</div>
                      <div style={{ fontSize:14, color:"#777", lineHeight:1.7 }}>{item.tip}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
