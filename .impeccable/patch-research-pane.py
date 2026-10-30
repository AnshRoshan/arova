import io

p = "src/app/page.tsx"
s = io.open(p, encoding="utf-8").read()
anchor = "function CapabilitiesEditor("
component = r'''/**
 * The research surface. It is deliberately model-free: a source is fetched through the same policy
 * as the model's web tool or pasted with its excerpt, and a finding may cite only sources in its own
 * project. The brief is assembled locally so it can be copied even when no provider is configured.
 */
function ResearchPane({ projects, sources, findings, agents, teams, projectId, onSelect, busy, act, notify, onAskDelete, onNew }: {
  projects: ResearchProject[]; sources: ResearchSource[]; findings: ResearchFinding[];
  agents: Agent[]; teams: Team[]; projectId: string | null; onSelect: (id: string) => void;
  busy: boolean; act: (a: string, p?: Record<string, unknown>, s?: string) => Promise<unknown>;
  notify: (message: string) => void; onAskDelete: (id: string, name: string) => void; onNew: () => void;
}) {
  const project = projects.find(p => p.id === projectId) ?? projects[0] ?? null;
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", question: "", agentId: "", teamId: "" });
  const [mode, setMode] = useState<"fetch" | "paste">("fetch");
  const [src, setSrc] = useState({ url: "", text: "", title: "", note: "", tag: "" });
  const [finding, setFinding] = useState({ text: "", sourceIds: [] as string[] });
  useEffect(() => {
    if (project) setEdit({ name: project.name, question: project.question, agentId: project.agentId ?? "", teamId: project.teamId ?? "" });
  }, [project?.id]);

  if (!project) return <div className="pane">
    <div className="pane-head"><div><h1>Research</h1><p>A project is a question, the sources behind it, and the findings that cite them.</p></div><div className="push" /><button className="primary" onClick={onNew}><Plus size={15} />New project</button></div>
    <div className="blank"><h3>No research yet</h3><p>Start with a question. Sources can be fetched or pasted, and the brief stays copyable without a model.</p><button className="primary" onClick={onNew}><Plus size={14} />Create a project</button></div>
  </div>;

  const ordered = sources.filter(s => s.projectId === project.id).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  const numbers = new Map(ordered.map((source, index) => [source.id, index + 1]));
  const findingsFor = findings.filter(f => f.projectId === project.id);
  const archived = project.status === "ARCHIVED";
  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(researchBrief(project, ordered, findingsFor));
      notify("Brief copied — question, findings and numbered sources.");
    } catch { notify("The browser refused the clipboard. Select the source text instead."); }
  };
  const saveEdit = async () => {
    const r = await act("updateResearchProject", { projectId: project.id, name: edit.name, question: edit.question, agentId: edit.agentId || null, teamId: edit.teamId || null }, "Project saved");
    if (r) setEditing(false);
  };
  const addSource = async () => {
    const payload = mode === "fetch"
      ? { projectId: project.id, url: src.url, note: src.note, tag: src.tag }
      : { projectId: project.id, ...(src.url.trim() ? { url: src.url } : {}), text: src.text, title: src.title, note: src.note, tag: src.tag };
    const r = await act("addResearchSource", payload, mode === "fetch" ? "Source fetched and saved" : "Excerpt saved");
    if (r) setSrc({ url: "", text: "", title: "", note: "", tag: "" });
  };
  const saveFinding = async () => {
    const r = await act("saveResearchFinding", { projectId: project.id, text: finding.text, sourceIds: finding.sourceIds }, "Finding saved with its sources");
    if (r) setFinding({ text: "", sourceIds: [] });
  };

  return <div className="pane">
    <div className="pane-head">
      <div><h1>{project.name}</h1><p>{project.question || "No question recorded yet — add one so the brief says what this answers."}</p></div>
      <div className="push" />
      <button className="ghost" onClick={copyBrief}><Copy size={14} />Copy brief</button>
      <button className="ghost" onClick={() => setEditing(v => !v)}><Pencil size={14} />{editing ? "Close" : "Edit"}</button>
      <button className="ghost" onClick={async () => { await act("updateResearchProject", { projectId: project.id, status: archived ? "ACTIVE" : "ARCHIVED" }, archived ? "Project reopened" : "Project archived"); }}><ShieldCheck size={14} />{archived ? "Reopen" : "Archive"}</button>
      <button className="icon-btn" title="Delete this project" onClick={() => onAskDelete(project.id, project.name)}><Trash2 size={15} /></button>
    </div>
    <div className="facts research-facts">
      <span className={`fact ${archived ? "" : "live"}`}><i className="fact-dot" />{archived ? "archived" : "active"}</span>
      <span className="fact">{ordered.length} source{ordered.length === 1 ? "" : "s"}</span>
      <span className="fact">{findingsFor.length} finding{findingsFor.length === 1 ? "" : "s"}</span>
      {project.agentId && <span className="fact">{agents.find(a => a.id === project.agentId)?.name ?? "assigned seat"}</span>}
      {project.teamId && <span className="fact">{teams.find(t => t.id === project.teamId)?.name ?? "organisation"}</span>}
    </div>

    {editing && <div className="stack"><div className="block">
      <div className="field"><label htmlFor="rp-name">Name</label><input id="rp-name" maxLength={80} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="rp-q">Question</label><textarea id="rp-q" rows={3} maxLength={1000} value={edit.question} onChange={e => setEdit({ ...edit, question: e.target.value })} /></div>
      <div className="field"><label htmlFor="rp-agent">Seat</label><select id="rp-agent" value={edit.agentId} onChange={e => setEdit({ ...edit, agentId: e.target.value })}><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div className="field"><label htmlFor="rp-team">Organisation</label><select id="rp-team" value={edit.teamId} onChange={e => setEdit({ ...edit, teamId: e.target.value })}><option value="">None</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <button className="primary" disabled={busy || !edit.name.trim()} onClick={saveEdit}>Save project</button>
    </div></div>}

    <h2 className="pane-h2">Add a source<span className="mono">{mode === "fetch" ? "https only · same policy as web_fetch" : "pasted excerpt · no network call"}</span></h2>
    <div className="stack"><div className="block">
      <div className="seg" role="group" aria-label="Source mode">
        <button type="button" className={mode === "fetch" ? "on" : ""} onClick={() => setMode("fetch")}>Fetch a URL</button>
        <button type="button" className={mode === "paste" ? "on" : ""} onClick={() => setMode("paste")}>Paste an excerpt</button>
      </div>
      {mode === "fetch" ? <>
        <div className="field"><label htmlFor="src-url">URL</label><input id="src-url" maxLength={2000} placeholder="https://example.com/report" value={src.url} onChange={e => setSrc({ ...src, url: e.target.value })} /><span className="hint">Public https only, no credentials, no ports, three redirects. The readable excerpt is stored with the final URL.</span></div>
        <div className="field"><label htmlFor="src-note">Why it matters (optional)</label><input id="src-note" maxLength={600} placeholder="Supports the per-seat pricing claim" value={src.note} onChange={e => setSrc({ ...src, note: e.target.value })} /></div>
        <div className="field"><label htmlFor="src-tag">Tag (optional)</label><input id="src-tag" maxLength={40} placeholder="pricing" value={src.tag} onChange={e => setSrc({ ...src, tag: e.target.value })} /></div>
        <button className="primary" disabled={busy || !src.url.trim()} onClick={addSource}>Fetch and save</button>
      </> : <>
        <div className="field"><label htmlFor="src-text">Excerpt</label><textarea id="src-text" rows={5} maxLength={20000} placeholder="Paste the passage you are relying on." value={src.text} onChange={e => setSrc({ ...src, text: e.target.value })} /></div>
        <div className="field"><label htmlFor="src-title">Title</label><input id="src-title" maxLength={300} placeholder="Interview notes, 12 March" value={src.title} onChange={e => setSrc({ ...src, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="src-purl">Source URL (optional)</label><input id="src-purl" maxLength={2000} placeholder="https://…" value={src.url} onChange={e => setSrc({ ...src, url: e.target.value })} /></div>
        <div className="field"><label htmlFor="src-pnote">Why it matters (optional)</label><input id="src-pnote" maxLength={600} value={src.note} onChange={e => setSrc({ ...src, note: e.target.value })} /></div>
        <button className="primary" disabled={busy || src.text.trim().length < 10} onClick={addSource}>Save excerpt</button>
      </>}
    </div></div>

    <h2 className="pane-h2">Sources<span className="mono">{ordered.length} · numbered the same way in the brief</span></h2>
    {ordered.length ? <div className="rows">{ordered.map(source => <div className="row" key={source.id}>
      <span className="row-face mono">[{numbers.get(source.id)}]</span>
      <span className="row-main">
        <strong>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.host || source.url}</a> : source.title || "Pasted note"} {source.pinned && <Pin size={11} />}</strong>
        <span>{source.host || "pasted"} · {source.tag ? `${source.tag} · ` : ""}{source.fetchedAt ? `fetched ${stamp(source.fetchedAt)}` : `saved ${stamp(source.createdAt)}`}</span>
        {source.note && <span className="row-when">{source.note}</span>}
        <details className="research-excerpt"><summary>Excerpt</summary><p>{source.excerpt || "No excerpt stored."}</p></details>
      </span>
      <span className="row-actions">
        <button className="icon-btn" title={source.pinned ? "Unpin" : "Pin to the top of the brief"} disabled={busy} onClick={() => void act("updateResearchSource", { sourceId: source.id, pinned: !source.pinned }, source.pinned ? "Unpinned" : "Pinned")}>{source.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
        {source.url && <a className="icon-btn" href={source.url} target="_blank" rel="noreferrer" title="Open the source"><ExternalLink size={14} /></a>}
        <button className="icon-btn" title="Remove this source" disabled={busy} onClick={() => { if (window.confirm("Remove this source? The findings that cited it keep their text.")) void act("deleteResearchSource", { sourceId: source.id }, "Source removed"); }}><Trash2 size={14} /></button>
      </span>
    </div>)}</div> : <div className="blank"><h3>No sources yet</h3><p>Fetch a public page or paste an excerpt. Nothing is invented to fill the gap.</p></div>}

    <h2 className="pane-h2">Findings<span className="mono">{findingsFor.length} · cite sources by number</span></h2>
    <div className="stack"><div className="block">
      <div className="field"><label htmlFor="fd-text">What did you establish?</label><textarea id="fd-text" rows={3} maxLength={2000} placeholder="Every rival charges per seat; only one includes audit history." value={finding.text} onChange={e => setFinding({ ...finding, text: e.target.value })} /></div>
      <div className="field"><label>Sources behind it</label>{ordered.length ? ordered.map(source => <label key={source.id} className="check-row"><input type="checkbox" checked={finding.sourceIds.includes(source.id)} onChange={e => setFinding({ ...finding, sourceIds: e.target.checked ? [...finding.sourceIds, source.id] : finding.sourceIds.filter(id => id !== source.id) })} /><span>[{numbers.get(source.id)}] {source.title || source.host || "Pasted note"}</span></label>) : <span className="hint">Add a source first; a finding may cite only sources in this project.</span>}</div>
      <button className="primary" disabled={busy || finding.text.trim().length < 3} onClick={saveFinding}>Save finding</button>
    </div></div>
    {findingsFor.length ? <div className="rows">{findingsFor.map(item => <div className="row" key={item.id}>
      <span className="row-face"><Brain size={14} /></span>
      <span className="row-main"><strong>{item.text}</strong><span>{item.sourceIds.length ? `cites ${item.sourceIds.map(id => numbers.has(id) ? `[${numbers.get(id)}]` : "[removed]").join(" ")}` : "no source cited"} · {stamp(item.createdAt)}</span></span>
      <span className="row-actions"><button className="icon-btn" title="Delete finding" disabled={busy} onClick={() => { if (window.confirm("Delete this finding? Sources stay.")) void act("deleteResearchFinding", { findingId: item.id }, "Finding removed"); }}><Trash2 size={14} /></button></span>
    </div>)}</div> : <div className="blank"><h3>No findings yet</h3><p>A finding is a sentence you can defend, with the sources that support it.</p></div>}
  </div>;
}

'''
assert anchor in s
s = s.replace(anchor, component + anchor, 1)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

c = "src/app/globals.css"
css = io.open(c, encoding="utf-8").read()
if ".research-excerpt" not in css:
    css += '''
.research-excerpt { margin-top: 4px; font-size: 12.5px; color: var(--ink-2); }
.research-excerpt summary { cursor: pointer; color: var(--ink-3); }
.research-excerpt p { margin: 6px 0 0; line-height: 1.55; max-height: 220px; overflow: auto; }
.research-facts { margin-bottom: 10px; }
.icon-btn[href] { display: inline-grid; place-items: center; }
'''
io.open(c, "w", encoding="utf-8", newline="\n").write(css)
print("ResearchPane added")
