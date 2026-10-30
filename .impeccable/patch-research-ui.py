import io

p = "src/app/page.tsx"
s = io.open(p, encoding="utf-8").read()

# icons
s = s.replace(
    "  Trash2, User, Users, WandSparkles, X, Zap, ListChecks, Building2, Cpu, Gauge, Link2, PanelLeftClose, PanelLeftOpen, MessageSquare, ArrowDownLeft, Brain, Pin, PinOff, Webhook, Pencil, type LucideIcon,",
    "  Trash2, User, Users, WandSparkles, X, Zap, ListChecks, Building2, Cpu, Gauge, Link2, PanelLeftClose, PanelLeftOpen, MessageSquare, ArrowDownLeft, Brain, Pin, PinOff, Webhook, Pencil, BookOpen, ExternalLink, type LucideIcon,",
)

# types
s = s.replace('type Pane = "overview" | "org" | "scheduler" | "tools" | "settings" | "channel";',
              'type Pane = "overview" | "org" | "scheduler" | "tools" | "settings" | "channel" | "research";')
s = s.replace('type EvalSuite = {', '''type ResearchProject = { id: string; name: string; question: string; status: string; agentId: string | null; teamId: string | null; createdAt: string; updatedAt: string; sourceCount: number; findingCount: number };
type ResearchSource = { id: string; projectId: string; url: string; host: string; title: string; excerpt: string; note: string; tag: string; pinned: boolean; addedBy: string; fetchedAt: string | null; createdAt: string };
type ResearchFinding = { id: string; projectId: string; text: string; sourceIds: string[]; createdAt: string };
type EvalSuite = {''')
s = s.replace('  evals: { tasks: EvalTask[]; results: EvalResultRow[]; suites: EvalSuite[]; summary: EvalSummary };',
'''  evals: { tasks: EvalTask[]; results: EvalResultRow[]; suites: EvalSuite[]; summary: EvalSummary };
  research: { projects: ResearchProject[]; sources: ResearchSource[]; findings: ResearchFinding[] };''')

# dialog union
s = s.replace('const [dialog, setDialog] = useState<null | "agent" | "routine" | "team" | Run>(null);',
              'const [dialog, setDialog] = useState<null | "agent" | "routine" | "team" | "research" | Run>(null);')

# state
s = s.replace('  const [suiteForm, setSuiteForm] = useState<{ name: string; agentId: string; callCeiling: number; taskIds: string[] }>({ name: "", agentId: "", callCeiling: 10, taskIds: [] });',
'''  const [suiteForm, setSuiteForm] = useState<{ name: string; agentId: string; callCeiling: number; taskIds: string[] }>({ name: "", agentId: "", callCeiling: 10, taskIds: [] });
  const [researchId, setResearchId] = useState<string | null>(null);
  const [researchForm, setResearchForm] = useState({ name: "", question: "", agentId: "", teamId: "" });''')

# effect: keep a selected project
s = s.replace('  useEffect(() => { if (!suiteForm.agentId && data?.agents.length) setSuiteForm(f => ({ ...f, agentId: data.agents[0].id })); }, [data, suiteForm.agentId]);',
'''  useEffect(() => { if (!suiteForm.agentId && data?.agents.length) setSuiteForm(f => ({ ...f, agentId: data.agents[0].id })); }, [data, suiteForm.agentId]);
  useEffect(() => {
    const projects = data?.research.projects ?? [];
    if (projects.length && (!researchId || !projects.some(p => p.id === researchId))) setResearchId(projects[0].id);
  }, [data, researchId]);''')

# askDelete union
s = s.replace('useState<{ kind: "routine" | "agent" | "team" | "channel" | "eval" | "suite" | "sandbox"; id: string; name: string } | null>(null)',
              'useState<{ kind: "routine" | "agent" | "team" | "channel" | "eval" | "suite" | "sandbox" | "research"; id: string; name: string } | null>(null)')

# panel title / rail / heading
s = s.replace('const panelTitle = { overview: "Shortcuts", agents: "The bench", org: "Reporting lines", scheduler: "Routines", tools: "Connectors", settings: "Workspace" }[section];',
              'const panelTitle = { overview: "Shortcuts", agents: "The bench", org: "Reporting lines", scheduler: "Routines", tools: "Connectors", settings: "Workspace", research: "Projects" }[section];')
s = s.replace('    { id: "org", label: "Organisation", icon: Network },',
              '    { id: "org", label: "Organisation", icon: Network },\n    { id: "research", label: "Research", icon: BookOpen },')
s = s.replace('pane === "tools" ? "Integrations" : "Settings"}',
              'pane === "tools" ? "Integrations" : pane === "research" ? "Research" : "Settings"}')

# panel plus button
s = s.replace('(section === "agents" || section === "org" || section === "scheduler") && <button className="sp-icon" title={section === "agents" ? "New agent" : section === "org" ? "New team" : "New routine"} aria-label="Create new" onClick={() => {',
              '(section === "agents" || section === "org" || section === "scheduler" || section === "research") && <button className="sp-icon" title={section === "agents" ? "New agent" : section === "org" ? "New team" : section === "research" ? "New project" : "New routine"} aria-label="Create new" onClick={() => {')
s = s.replace('''          if (section === "agents") setDialog("agent");
          else if (section === "org") setDialog("team");
          else { setRoutineForm({ name: "", description: "", schedule: "Every day at 8:00 AM", agentId: agent?.id ?? "" }); setDialog("routine"); }''',
'''          if (section === "agents") setDialog("agent");
          else if (section === "org") setDialog("team");
          else if (section === "research") setDialog("research");
          else { setRoutineForm({ name: "", description: "", schedule: "Every day at 8:00 AM", agentId: agent?.id ?? "" }); setDialog("routine"); }''')

# panel content
anchor = '      {section === "settings" && <div className="sp-scroll">'
panel = '''      {section === "research" && <div className="sp-scroll">
        <div className="sp-group">Projects</div>
        {data.research.projects.map(p => <button key={p.id} className={`sp-item ${researchId === p.id ? "on" : ""}`} onClick={() => { setResearchId(p.id); setPane("research"); setRail(false); }}>
          <span className="sp-item-icon"><BookOpen size={16} /></span>
          <span className="sp-item-main"><b>{p.name}</b><em>{p.status === "ARCHIVED" ? "archived · " : ""}{p.sourceCount} source{p.sourceCount === 1 ? "" : "s"} · {p.findingCount} finding{p.findingCount === 1 ? "" : "s"}</em></span>
          {p.sourceCount > 0 && <span className="sp-count">{p.sourceCount}</span>}
        </button>)}
        {!data.research.projects.length && <p className="sp-note">A project is a question, the sources behind it, and the findings that cite them.</p>}
        <div className="sp-group">The rule</div>
        <p className="sp-note">A source is fetched through the same https-only policy as the model's web tool, or pasted with its excerpt. Collecting and citing calls no model.</p>
      </div>}

      {section === "settings" && <div className="sp-scroll">'''
assert anchor in s
s = s.replace(anchor, panel, 1)

# main render: insert before settings pane render
render_anchor = '      {pane === "settings" && <div className="pane">'
render = '''      {pane === "research" && <ResearchPane
        projects={data.research.projects}
        sources={data.research.sources}
        findings={data.research.findings}
        agents={data.agents}
        teams={data.teams}
        projectId={researchId}
        onSelect={id => setResearchId(id)}
        busy={busy}
        act={act}
        notify={setToast}
        onAskDelete={(id, name) => setAskDelete({ kind: "research", id, name })}
        onNew={() => setDialog("research")}
      />}

      {pane === "settings" && <div className="pane">'''
assert render_anchor in s
s = s.replace(render_anchor, render, 1)

# create dialog before the team dialog
dialog_anchor = '      {dialog === "team" && <form className="dialog"'
dialog = '''      {dialog === "research" && <form className="dialog" onSubmit={async e => {
        e.preventDefault();
        const r = await act("createResearchProject", { name: researchForm.name, question: researchForm.question, ...(researchForm.agentId ? { agentId: researchForm.agentId } : {}), ...(researchForm.teamId ? { teamId: researchForm.teamId } : {}) }, "Research project created");
        if (r) { setDialog(null); setResearchId(String((r as { projectId?: string }).projectId ?? "")); setPane("research"); setResearchForm({ name: "", question: "", agentId: "", teamId: "" }); }
      }}>
        <div className="dialog-top"><span className="mark"><BookOpen size={14} /></span><h2>New research project</h2><button type="button" className="icon-btn x" onClick={() => setDialog(null)} aria-label="Close"><X size={15} /></button></div>
        <div className="field"><label htmlFor="rs-name">Name</label><input id="rs-name" maxLength={80} placeholder="Q4 pricing" value={researchForm.name} onChange={e => setResearchForm({ ...researchForm, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="rs-q">Question</label><textarea id="rs-q" rows={3} maxLength={1000} placeholder="What do competitors charge per seat, and what is included?" value={researchForm.question} onChange={e => setResearchForm({ ...researchForm, question: e.target.value })} /></div>
        <div className="field"><label htmlFor="rs-agent">Seat (optional)</label><select id="rs-agent" value={researchForm.agentId} onChange={e => setResearchForm({ ...researchForm, agentId: e.target.value })}><option value="">Unassigned</option>{data.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label htmlFor="rs-team">Organisation (optional)</label><select id="rs-team" value={researchForm.teamId} onChange={e => setResearchForm({ ...researchForm, teamId: e.target.value })}><option value="">None</option>{data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="dialog-actions"><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={busy || !researchForm.name.trim()}>Create project</button></div>
      </form>}

      {dialog === "team" && <form className="dialog"'''
assert dialog_anchor in s
s = s.replace(dialog_anchor, dialog, 1)

# delete copy and handler
s = s.replace("askDelete.kind === 'suite' ? 'The suite and its stored counts are removed. The eval results it already measured stay.'",
              "askDelete.kind === 'suite' ? 'The suite and its stored counts are removed. The eval results it already measured stay.' : askDelete.kind === 'research' ? 'The project, every source and every finding in it are removed. Nothing outside this workspace is touched.'")
s = s.replace("else if (target.kind === 'suite') await act('deleteSuite', { suiteId: target.id }, 'Suite deleted');",
              "else if (target.kind === 'suite') await act('deleteSuite', { suiteId: target.id }, 'Suite deleted'); else if (target.kind === 'research') await act('deleteResearchProject', { projectId: target.id }, 'Project deleted');")

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("research UI wiring applied")
