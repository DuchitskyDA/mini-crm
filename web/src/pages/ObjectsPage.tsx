import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useDeleteObject, useObjects, useSaveObject, type ObjectInput } from '../api/queries'
import { ObjectForm } from '../components/forms'
import { Button, ConfirmDialog, EmptyState, ErrorBox, ListSkeleton, Modal, PageTitle } from '../components/ui'
import type { CrmObject, Profile } from '../domain/types'
import { errorText } from '../lib/errors'
import { useAction } from '../lib/useAction'

export type ObjectDialog = { kind: 'create' } | { kind: 'edit'; object: CrmObject } | { kind: 'delete'; object: CrmObject }

type ObjectsViewProps = {
  profile: Profile
  objects: CrmObject[] | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  onSave: (id: string | undefined, input: ObjectInput) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  // Для макетов: открыть окно сразу и показать в нём ошибку.
  demo?: { dialog?: ObjectDialog; error?: string }
}

export function ObjectsView({ profile, objects, loading, error, onRetry, onSave, onDelete, demo }: ObjectsViewProps) {
  const isManager = profile.role === 'manager'
  const [dialog, setDialog] = useState<ObjectDialog | null>(demo?.dialog ?? null)
  const action = useAction()
  const close = () => {
    setDialog(null)
    action.reset()
  }
  const addButton = <Button onClick={() => setDialog({ kind: 'create' })}>Добавить объект</Button>

  return (
    <>
      <PageTitle title="Объекты" actions={isManager && addButton} />
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorBox message={`Не удалось загрузить объекты: ${errorText(error)}`} onRetry={onRetry} />
      ) : !objects?.length ? (
        isManager ? (
          <EmptyState text="Объектов пока нет. Добавьте первую стройку." action={addButton} />
        ) : (
          <EmptyState text="Вам пока не назначено задач ни на одном объекте." />
        )
      ) : (
        <ul className="space-y-2">
          {objects.map((o) => (
            <li key={o.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/objects/${o.id}`} className="min-w-0 rounded-sm hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
                  <span className="block text-sm font-medium break-words text-slate-900">{o.name}</span>
                  <span className="block text-xs text-slate-500">{o.address}</span>
                </Link>
                {isManager && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'edit', object: o })}>
                      Изменить
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDialog({ kind: 'delete', object: o })}>
                      Удалить
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog && dialog.kind !== 'delete' && (
        <Modal title={dialog.kind === 'create' ? 'Новый объект' : 'Изменить объект'} onClose={close} busy={action.pending}>
          <ObjectForm
            initial={dialog.kind === 'edit' ? dialog.object : undefined}
            submitLabel={dialog.kind === 'create' ? 'Создать объект' : 'Сохранить'}
            pending={action.pending}
            error={action.error ?? demo?.error}
            onCancel={close}
            onSubmit={async (input) => {
              if (await action.run(() => onSave(dialog.kind === 'edit' ? dialog.object.id : undefined, input))) close()
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Удалить объект"
          text={`Удалить объект «${dialog.object.name}»?`}
          confirmLabel="Удалить"
          pending={action.pending}
          error={action.error ?? demo?.error}
          onClose={close}
          onConfirm={async () => {
            if (await action.run(() => onDelete(dialog.object.id))) close()
          }}
        />
      )}
    </>
  )
}

export default function ObjectsPage() {
  const { profile } = useOutletContext<{ profile: Profile }>()
  const objects = useObjects()
  const save = useSaveObject()
  const del = useDeleteObject()
  return (
    <ObjectsView
      profile={profile}
      objects={objects.data}
      loading={objects.isPending}
      error={objects.error}
      onRetry={() => objects.refetch()}
      onSave={(id, input) => save.mutateAsync({ id, input })}
      onDelete={(id) => del.mutateAsync(id)}
    />
  )
}
