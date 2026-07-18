// Hearth UI kit — Workspace settings app. Composes the DS primitives.
// Ported from the Hearth handoff (ui_kits/webapp/Screens.jsx).

import { useState, type CSSProperties } from 'react';
import {
  Button, IconButton, Input, Select, Checkbox, RadioGroup, Switch, Field,
  Badge, Tag, Callout, Tooltip, Card, Tabs, Ic, icons,
} from './components/hearth';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'grid' },
  { id: 'members', label: 'Members', icon: 'users' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'cog' },
];

function Sidebar({ active, onNav }: { active: string; onNav: (id: string) => void }) {
  return (
    <aside style={{ width: 244, flex: '0 0 244px', background: 'var(--paper-2)', borderRight: '1px solid var(--rule)',
      display: 'flex', flexDirection: 'column', padding: '20px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 22px' }}>
        <span style={{ width: 15, height: 15, background: 'var(--accent)', borderRadius: 3, transform: 'rotate(45deg)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.03em' }}>Hearth</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => {
          const on = active === n.id;
          return (
            <button key={n.id} onClick={() => onNav(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', border: 0, cursor: 'pointer',
              borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', textAlign: 'left',
              fontWeight: on ? 600 : 500,
              background: on ? 'var(--accent-wash)' : 'transparent',
              color: on ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
              <Ic d={icons[n.icon]} size={18} />{n.label}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
        borderTop: '1px solid var(--rule)' }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ink)', color: 'var(--paper)',
          display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>RK</span>
        <div style={{ lineHeight: 1.2, overflow: 'hidden' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Rae Kim</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Owner</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ onInvite }: { onInvite: () => void }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 32px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Acme Studio</div>
        <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: '-0.025em' }}>Workspace settings</h1>
      </div>
      <div style={{ position: 'relative', width: 240 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}><Ic d={icons.search} size={17} /></span>
        <Input placeholder="Search settings…" style={{ paddingLeft: 38 }} />
      </div>
      <Button variant="accent" iconStart={<Ic d={icons.plus} size={18} />} onClick={onInvite}>Invite people</Button>
    </header>
  );
}

function GeneralPanel() {
  const [name, setName] = useState('Acme Studio');
  const [region, setRegion] = useState('us');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start', maxWidth: 860 }}>
      <Card title="Workspace details" description="Shown to everyone in this workspace.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Workspace name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Data region" helper="Where your projects are stored.">
            <Select value={region} onChange={(e) => setRegion(e.target.value)}
              options={[{ value: 'us', label: 'United States' }, { value: 'eu', label: 'Europe (Frankfurt)' }, { value: 'ap', label: 'Asia-Pacific (Seoul)' }]} />
          </Field>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <Button variant="primary">Save changes</Button>
            <Button variant="ghost">Discard</Button>
          </div>
        </div>
      </Card>
      <Card title="Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Switch label="Weekly digest email" checked onChange={() => {}} />
          <Switch label="Notify on new members" checked onChange={() => {}} />
          <Switch label="Public project gallery" onChange={() => {}} />
          <Checkbox label="Require 2-factor for all members" checked onChange={() => {}} />
        </div>
      </Card>
    </div>
  );
}

const MEMBERS: { n: string; e: string; role: string; tone: 'accent' | 'info' | 'neutral'; team: string; i: string }[] = [
  { n: 'Rae Kim', e: 'rae@acme.studio', role: 'Owner', tone: 'accent', team: 'Design', i: 'RK' },
  { n: 'Jun Park', e: 'jun@acme.studio', role: 'Admin', tone: 'info', team: 'Engineering', i: 'JP' },
  { n: 'Mara Vos', e: 'mara@acme.studio', role: 'Member', tone: 'neutral', team: 'Design', i: 'MV' },
  { n: 'Theo Lang', e: 'theo@acme.studio', role: 'Member', tone: 'neutral', team: 'Growth', i: 'TL' },
];

function MembersPanel() {
  const [q, setQ] = useState('');
  const rows = MEMBERS.filter((m) => m.n.toLowerCase().includes(q.toLowerCase()));
  const colStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 44px', gap: 12 };
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}><Ic d={icons.search} size={17} /></span>
          <Input placeholder="Filter members…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <Button variant="secondary">Export</Button>
      </div>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...colStyle, padding: '0 4px 12px',
            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            <span>Member</span><span>Role</span><span>Team</span><span></span>
          </div>
          {rows.map((m) => (
            <div key={m.e} style={{ ...colStyle, alignItems: 'center', padding: '12px 4px', borderTop: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--paper-3)', color: 'var(--ink-2)',
                  display: 'grid', placeItems: 'center', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{m.i}</span>
                <div style={{ lineHeight: 1.25 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{m.n}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{m.e}</div>
                </div>
              </div>
              <span><Badge tone={m.tone}>{m.role}</Badge></span>
              <span><Tag>{m.team}</Tag></span>
              <Tooltip label="Manage"><IconButton label="Manage member"><Ic d={icons.dots} /></IconButton></Tooltip>
            </div>
          ))}
          {rows.length === 0 && <div style={{ padding: '20px 4px', color: 'var(--muted)', fontSize: '0.88rem' }}>No members match “{q}”.</div>}
        </div>
      </Card>
    </div>
  );
}

function BillingPanel() {
  const [cycle, setCycle] = useState('yr');
  const plans = [
    { id: 'starter', name: 'Starter', price: '$0', note: 'Up to 3 projects', active: false },
    { id: 'studio', name: 'Studio', price: cycle === 'yr' ? '$24' : '$30', note: 'Unlimited projects', active: true },
    { id: 'agency', name: 'Agency', price: cycle === 'yr' ? '$80' : '$99', note: 'SSO + audit log', active: false },
  ];
  return (
    <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Callout tone="info" title="You're on the Studio plan">Your next invoice is $288 on 1 Aug 2026.</Callout>
      <div>
        <div style={{ marginBottom: 14 }}>
          <RadioGroup name="cycle" value={cycle} onChange={setCycle}
            options={[{ value: 'mo', label: 'Monthly' }, { value: 'yr', label: 'Yearly · save 20%' }]} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {plans.map((p) => (
            <Card key={p.id} elevation={p.active ? 'raised' : 'flat'}
              footer={<Button size="sm" variant={p.active ? 'accent' : 'secondary'} fullWidth>{p.active ? 'Current plan' : 'Choose'}</Button>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.05rem' }}>{p.name}</span>
                {p.active && <Badge tone="accent">Active</Badge>}
              </div>
              <div style={{ margin: '10px 0 4px', fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
                {p.price}<span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontWeight: 400 }}> /mo</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--neutral)' }}>{p.note}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number, background: 'oklch(20% 0.01 60 / 0.4)',
      display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: 'var(--paper)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.02em' }}>Invite people</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--neutral)' }}>They'll get an email to join Acme Studio.</p>
          </div>
          <IconButton label="Close" onClick={onClose}><Ic d={icons.x} /></IconButton>
        </div>
        {sent ? (
          <Callout tone="success" title="Invitation sent">We emailed {email || 'your teammate'}.</Callout>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Email address" required>
              <Input type="email" placeholder="teammate@acme.studio" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role">
              <RadioGroup name="invrole" value={role} onChange={setRole}
                options={[{ value: 'member', label: 'Member — can view and edit projects' }, { value: 'admin', label: 'Admin — can manage members and billing' }]} />
            </Field>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <Button variant="ghost" onClick={onClose}>{sent ? 'Done' : 'Cancel'}</Button>
          {!sent && <Button variant="accent" onClick={() => setSent(true)}>Send invite</Button>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [nav, setNav] = useState('settings');
  const [tab, setTab] = useState('general');
  const [invite, setInvite] = useState(false);
  const tabs = [{ value: 'general', label: 'General' }, { value: 'members', label: 'Members', count: 4 }, { value: 'billing', label: 'Billing' }];
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
      <Sidebar active={nav} onNav={setNav} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar onInvite={() => setInvite(true)} />
        <div style={{ padding: '20px 32px 8px' }}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 32px 40px' }}>
          {tab === 'general' && <GeneralPanel />}
          {tab === 'members' && <MembersPanel />}
          {tab === 'billing' && <BillingPanel />}
        </div>
      </main>
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
    </div>
  );
}
