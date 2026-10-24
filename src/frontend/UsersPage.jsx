import React, { useCallback, useEffect, useState } from 'react';
import { generatePassword } from '../users/policy.js';
import { Icon } from './Icon.jsx';
import { Dropdown, Modal, Tabs, useToast } from './ui.jsx';

const ROLE_LABEL = { admin: 'Admin', member: 'Mitglied' };
const dateTime = (value) => (value ? new Date(value).toLocaleString('de-DE') : null);
const randomIndex = (n) => {
  // Rejection sampling keeps every character equally likely.
  const limit = Math.floor(0x100000000 / n) * n;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % n;
};

function describeAudit(entry) {
  const { action, detail } = entry;
  if (action === 'role_changed') return `Rolle geändert: ${ROLE_LABEL[detail.from] ?? detail.from} → ${ROLE_LABEL[detail.to] ?? detail.to}`;
  return {
    user_created: `Konto angelegt (${ROLE_LABEL[detail.role] ?? detail.role})`,
    user_disabled: 'Konto gesperrt',
    user_enabled: 'Konto entsperrt',
    user_deleted: 'Konto gelöscht',
    password_reset: 'Startpasswort gesetzt',
    password_changed: 'Passwort geändert',
  }[action] ?? action;
}

async function call(path, { method = 'GET', json } = {}) {
  const response = await fetch(path, { method, headers: json ? { 'content-type': 'application/json' } : undefined, body: json ? JSON.stringify(json) : undefined });
  if (response.status === 401) { window.location.assign('/anmelden'); return { ok: false, data: {} }; }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function PasswordField({ id, label, value, onChange, error }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="field-row">
        <input id={id} className="input" type="text" autoComplete="off" spellCheck="false" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : `${id}-hint`} />
        <button type="button" className="btn btn-secondary" onClick={() => onChange(generatePassword(randomIndex))}><Icon name="KeyRound" />Erzeugen</button>
      </div>
      <span id={`${id}-hint`} className="text-description">Mindestens 12 Zeichen. Es muss bei der ersten Anmeldung geändert werden.</span>
      {error && <span id={`${id}-error`} className="field-error">{error}</span>}
    </div>
  );
}

function UserTable({ users, me, loading, onAction }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th scope="col">Benutzer</th><th scope="col">Rolle</th><th scope="col">Status</th><th scope="col">Letzte Anmeldung</th><th scope="col" className="col-actions"><span className="sr-only">Aktionen</span></th></tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 3 }, (_, index) => (
            <tr key={index} aria-hidden="true"><td><span className="skeleton skeleton-w-60" /></td><td><span className="skeleton skeleton-w-40" /></td><td><span className="skeleton skeleton-w-40" /></td><td><span className="skeleton skeleton-w-60" /></td><td /></tr>
          ))}
          {!loading && users.map((user) => {
            const self = String(user.id) === String(me.id);
            return (
              <tr key={user.id}>
                <th scope="row" className="cell-name">{user.username}{self && <span className="text-meta"> (Sie)</span>}</th>
                <td><span className={`badge ${user.role === 'admin' ? 'badge-pending' : 'badge-info'}`}>{ROLE_LABEL[user.role]}</span></td>
                <td>
                  <span className={`badge ${user.active ? 'badge-success' : 'badge-error'}`}>{user.active ? 'Aktiv' : 'Gesperrt'}</span>
                  {user.mustChangePassword && <span className="badge badge-pending cell-badge">Passwort offen</span>}
                </td>
                <td>{dateTime(user.lastLoginAt) ?? <span className="text-description">Noch nie</span>}</td>
                <td className="col-actions">
                  {self ? <a className="btn btn-ghost" href="/konto">Konto</a> : (
                    <Dropdown
                      label={`Aktionen für ${user.username}`}
                      items={[
                        { id: 'role', label: user.role === 'admin' ? 'Zum Mitglied machen' : 'Zum Admin machen', icon: user.role === 'admin' ? 'User' : 'ShieldCheck', onSelect: () => onAction('role', user) },
                        { id: 'active', label: user.active ? 'Sperren' : 'Entsperren', icon: user.active ? 'Lock' : 'LockOpen', onSelect: () => onAction('active', user) },
                        { id: 'reset', label: 'Startpasswort setzen', icon: 'KeyRound', onSelect: () => onAction('reset', user) },
                        { id: 'delete', label: 'Löschen', icon: 'Trash2', danger: true, onSelect: () => onAction('delete', user) },
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ entries, loading }) {
  if (!loading && entries.length === 0) {
    return (
      <div className="empty">
        <Icon name="FileText" size={24} />
        <h2>Noch keine Einträge</h2>
        <p>Änderungen an Konten erscheinen hier.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th scope="col">Zeitpunkt</th><th scope="col">Änderung</th><th scope="col">Konto</th><th scope="col">Durch</th></tr></thead>
        <tbody>
          {loading && Array.from({ length: 3 }, (_, index) => (
            <tr key={index} aria-hidden="true"><td><span className="skeleton skeleton-w-60" /></td><td><span className="skeleton skeleton-w-80" /></td><td><span className="skeleton skeleton-w-40" /></td><td><span className="skeleton skeleton-w-40" /></td></tr>
          ))}
          {!loading && entries.map((entry) => (
            <tr key={entry.id}><td className="tabular">{dateTime(entry.at)}</td><td>{describeAudit(entry)}</td><td>{entry.targetName ?? '–'}</td><td>{entry.actorName ?? '–'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersPage({ me }) {
  const toast = useToast();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // { type, user? }
  const [form, setForm] = useState({ username: '', role: 'member', password: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [list, log] = await Promise.all([call('/api/users'), call('/api/audit')]);
    if (list.ok) setUsers(list.data.users); else toast.error('Nutzer konnten nicht geladen werden', list.data.error);
    if (log.ok) setEntries(log.data.entries);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openDialog = (type, user = null) => {
    setForm({ username: '', role: 'member', password: '' });
    setFormError('');
    setDialog({ type, user });
  };
  const closeDialog = () => { if (!busy) setDialog(null); };

  // Runs one request, reports the result as a toast and refreshes the lists.
  const run = async (request, successTitle, successText) => {
    setBusy(true);
    setFormError('');
    const result = await call(...request);
    setBusy(false);
    if (!result.ok) return { error: result.data.error ?? 'Das hat nicht geklappt.' };
    toast.success(successTitle, successText);
    setDialog(null);
    await load();
    return {};
  };

  const onAction = async (type, user) => {
    if (type === 'role') {
      const to = user.role === 'admin' ? 'member' : 'admin';
      const result = await run([`/api/users/${user.id}`, { method: 'PATCH', json: { role: to } }], 'Rolle geändert', `${user.username} ist jetzt ${ROLE_LABEL[to]}.`);
      if (result.error) toast.error('Rolle nicht geändert', result.error);
    } else if (type === 'active') {
      const result = await run([`/api/users/${user.id}`, { method: 'PATCH', json: { active: !user.active } }], user.active ? 'Konto gesperrt' : 'Konto entsperrt', user.username);
      if (result.error) toast.error('Status nicht geändert', result.error);
    } else {
      openDialog(type, user);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    let result;
    if (dialog.type === 'create') {
      result = await run(['/api/users', { method: 'POST', json: form }], 'Konto angelegt', form.username);
    } else if (dialog.type === 'reset') {
      result = await run([`/api/users/${dialog.user.id}/password`, { method: 'POST', json: { password: form.password } }], 'Startpasswort gesetzt', `${dialog.user.username} meldet sich damit an und wählt dann ein eigenes.`);
    } else {
      result = await run([`/api/users/${dialog.user.id}`, { method: 'DELETE' }], 'Konto gelöscht', dialog.user.username);
    }
    if (result.error) setFormError(result.error);
  };

  const open = dialog?.type;
  const destructive = open === 'delete';
  const formId = 'user-dialog-form';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nutzer</h1>
          <p className="page-desc">Konten, Rollen und Zugang verwalten.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openDialog('create')}><Icon name="Plus" />Nutzer anlegen</button>
      </div>

      <Tabs label="Bereich" value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Nutzer' }, { id: 'log', label: 'Protokoll' }]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'users' ? <UserTable users={users} me={me} loading={loading} onAction={onAction} /> : <AuditTable entries={entries} loading={loading} />}
      </div>

      <Modal
        open={Boolean(open)}
        busy={busy}
        onClose={closeDialog}
        title={{ create: 'Nutzer anlegen', reset: 'Startpasswort setzen', delete: 'Konto löschen' }[open] ?? ''}
        description={{
          create: 'Das Konto erhält ein Startpasswort, das bei der ersten Anmeldung geändert werden muss.',
          reset: `Für ${dialog?.user?.username}. Alle bestehenden Anmeldungen enden.`,
          delete: `Das Konto „${dialog?.user?.username}“ und alle seine Anmeldungen werden gelöscht. Das lässt sich nicht rückgängig machen.`,
        }[open]}
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDialog} disabled={busy}>Abbrechen</button>
            <button type="submit" form={formId} className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} disabled={busy} aria-busy={busy}>
              {busy && <Icon name="LoaderCircle" className="spinner" />}
              {{ create: 'Anlegen', reset: 'Passwort setzen', delete: 'Löschen' }[open]}
            </button>
          </>
        )}
      >
        <form id={formId} className="stack modal-form" onSubmit={submit} noValidate>
          {formError && <p className="alert" role="alert"><Icon name="CircleAlert" /><span>{formError}</span></p>}
          {open === 'create' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="new-username">Benutzername</label>
                <input id="new-username" className="input" autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="new-role">Rolle</label>
                <div className="select-wrap">
                  <select id="new-role" className="input select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    <option value="member">Mitglied</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Icon name="ChevronDown" className="select-icon" />
                </div>
              </div>
            </>
          )}
          {(open === 'create' || open === 'reset') && <PasswordField id="new-password" label="Startpasswort" value={form.password} onChange={(password) => setForm({ ...form, password })} />}
        </form>
      </Modal>
    </>
  );
}
