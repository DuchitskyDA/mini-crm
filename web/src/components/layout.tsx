import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ROLE_LABEL } from '../domain/tasks'
import type { Profile } from '../domain/types'

export type Crumb = { label: string; to?: string }

export function AppHeader({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-base font-semibold text-slate-900">
          Объекты и задачи
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="min-w-0 text-right">
            <span className="block max-w-40 truncate font-medium text-slate-800 sm:max-w-none">{profile.full_name}</span>
            <span className="block text-xs text-slate-500">{ROLE_LABEL[profile.role]}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            Выйти
          </button>
        </div>
      </div>
    </header>
  )
}

// Вкладки нужны только исполнителю: у постановщика один раздел — «Объекты».
export function MainNav({ profile }: { profile: Profile }) {
  if (profile.role !== 'executor') return null
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`
  return (
    <nav className="mx-auto flex max-w-3xl gap-1 px-4 pt-3">
      <NavLink to="/my" className={link}>
        Мои задачи
      </NavLink>
      <NavLink to="/objects" className={link}>
        Объекты
      </NavLink>
    </nav>
  )
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Путь" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">›</span>}
          {c.to ? (
            <Link to={c.to} className="hover:text-sky-800 hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="text-slate-700">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function Shell({ profile, onSignOut, children }: { profile: Profile; onSignOut: () => void; children: ReactNode }) {
  return (
    <div>
      <AppHeader profile={profile} onSignOut={onSignOut} />
      <MainNav profile={profile} />
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
    </div>
  )
}
