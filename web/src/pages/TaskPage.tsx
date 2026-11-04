import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  useChangeStatus,
  useDeleteTask,
  useObject,
  useObjects,
  useProfiles,
  useTask,
  useTaskHistory,
  useUpdateTask,
  type TaskInput,
} from '../api/queries'
import { TaskForm } from '../components/forms'
import { Breadcrumbs } from '../components/layout'
import { StatusBadge, TaskDetails, TaskHistory } from '../components/tasks'
import { Button, Card, ConfirmDialog, EmptyState, ErrorBox, Field, ListSkeleton, Modal, TextArea } from '../components/ui'
import { availableActions, canChangeAssignee, canDeleteTask, canEditTask, requiredComment, type TaskAction, type TaskStatus } from '../domain/tasks'
import type { CrmObject, Profile, Task, TaskHistoryEntry } from '../domain/types'
import { errorText } from '../lib/errors'
import { useAction } from '../lib/useAction'

type Dialog = { kind: 'edit' } | { kind: 'delete' } | { kind: 'comment'; action: TaskAction }

type TaskViewProps = {
  profile: Profile
  task: Task | null | undefined
  objectName: string
  profiles: Profile[]
  objects: CrmObject[]
  history: TaskHistoryEntry[] | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  onChangeStatus: (to: TaskStatus, comment?: string) => Promise<unknown>
  onUpdate: (input: Partial<TaskInput>) => Promise<unknown>
  onDelete: () => Promise<unknown>
  demo?: { dialog?: Dialog; actionError?: string; dialogError?: string }
}

export function TaskView(props: TaskViewProps) {
  const { profile, task, objectName, profiles, objects, history, loading, error, onRetry, demo } = props
  const [dialog, setDialog] = useState<Dialog | null>(demo?.dialog ?? null)
  const statusAction = useAction()
  const dialogAction = useAction()
  const close = () => {
    setDialog(null)
    dialogAction.reset()
  }

  const placeholder = (body: ReactNode) => (
    <>
      <Breadcrumbs items={[{ label: 'Объекты', to: '/objects' }, { label: 'Задача' }]} />
      {body}
    </>
  )
  if (loading) return placeholder(<ListSkeleton rows={4} />)
  if (error) return placeholder(<ErrorBox message={`Не удалось загрузить задачу: ${errorText(error)}`} onRetry={onRetry} />)
  if (!task) return placeholder(<EmptyState text="Задача не найдена или у вас нет к ней доступа." />)

  const isManager = profile.role === 'manager'
  const actions = availableActions(task.status, profile.role, task.assignee_id === profile.id)
  const editable = isManager && canEditTask(task.status)
  const deletable = isManager && canDeleteTask(task.status)
  const actionError = statusAction.error ?? demo?.actionError

  return (
    <>
      <Breadcrumbs
        items={[{ label: 'Объекты', to: '/objects' }, { label: objectName || 'Объект', to: `/objects/${task.object_id}` }, { label: 'Задача' }]}
      />
      <div className="space-y-4">
        <Card className="p-4">
          <h1 className="text-xl font-semibold break-words text-slate-900">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            {actions.map((a) => (
              <Button
                key={a.to}
                size="sm"
                variant={a.requiresComment ? 'secondary' : 'primary'}
                disabled={statusAction.pending}
                onClick={() => (a.requiresComment ? setDialog({ kind: 'comment', action: a }) : void statusAction.run(() => props.onChangeStatus(a.to)))}
              >
                {a.label}
              </Button>
            ))}
            {(editable || deletable) && (
              <span className="flex gap-2 sm:ml-auto">
                {editable && (
                  <Button size="sm" variant="secondary" disabled={!objects.length} onClick={() => setDialog({ kind: 'edit' })}>
                    Изменить
                  </Button>
                )}
                {deletable && (
                  <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'delete' })}>
                    Удалить
                  </Button>
                )}
              </span>
            )}
          </div>
          {actionError && (
            <div className="mt-3">
              <ErrorBox message={actionError} />
            </div>
          )}
          <div className="mt-4">
            <TaskDetails task={task} objectName={objectName} profiles={profiles} />
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-base font-semibold">История</h2>
          {history ? <TaskHistory entries={history} profiles={profiles} /> : <ListSkeleton rows={2} />}
        </Card>
      </div>

      {dialog?.kind === 'comment' && (
        <CommentDialog
          action={dialog.action}
          pending={dialogAction.pending}
          error={dialogAction.error ?? demo?.dialogError}
          onClose={close}
          onSubmit={async (comment) => {
            if (await dialogAction.run(() => props.onChangeStatus(dialog.action.to, comment))) close()
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Изменить задачу" onClose={close} busy={dialogAction.pending}>
          <TaskForm
            initial={task}
            objects={objects}
            executors={profiles.filter((p) => p.role === 'executor')}
            canChangeAssignee={canChangeAssignee(task.status)}
            submitLabel="Сохранить"
            pending={dialogAction.pending}
            error={dialogAction.error ?? demo?.dialogError}
            onCancel={close}
            onSubmit={async ({ title, description, object_id, assignee_id }) => {
              // Исполнителя отправляем, только когда его можно менять (решение владельца).
              const input: Partial<TaskInput> = canChangeAssignee(task.status)
                ? { title, description, object_id, assignee_id }
                : { title, description, object_id }
              if (await dialogAction.run(() => props.onUpdate(input))) close()
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Удалить задачу"
          text={`Удалить задачу «${task.title}»?`}
          confirmLabel="Удалить"
          pending={dialogAction.pending}
          error={dialogAction.error ?? demo?.dialogError}
          onClose={close}
          onConfirm={() => void dialogAction.run(props.onDelete)}
        />
      )}
    </>
  )
}

function CommentDialog({
  action,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  action: TaskAction
  pending: boolean
  error?: string
  onClose: () => void
  onSubmit: (comment: string) => void
}) {
  const [comment, setComment] = useState('')
  const [empty, setEmpty] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = requiredComment(comment)
    if (!text) {
      setEmpty(true)
      return
    }
    onSubmit(text)
  }

  return (
    <Modal title={action.label} onClose={onClose} busy={pending}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Что доработать (обязательно)" error={empty ? 'Напишите, что нужно доработать.' : undefined}>
          <TextArea
            value={comment}
            required
            aria-required="true"
            onChange={(e) => {
              setComment(e.target.value)
              setEmpty(false)
            }}
            placeholder="Например: нет фото скрытых работ"
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={pending}>
            {pending ? 'Отправляем…' : action.label}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function TaskPage() {
  const { id = '' } = useParams()
  const { profile } = useOutletContext<{ profile: Profile }>()
  const navigate = useNavigate()
  const task = useTask(id)
  const history = useTaskHistory(id)
  const profiles = useProfiles()
  const object = useObject(task.data?.object_id ?? '', !!task.data)
  const objects = useObjects(profile.role === 'manager')
  const change = useChangeStatus()
  const update = useUpdateTask()
  const del = useDeleteTask()
  return (
    <TaskView
      profile={profile}
      task={task.data}
      objectName={object.data?.name ?? ''}
      profiles={profiles.data ?? []}
      objects={objects.data ?? []}
      history={history.data}
      loading={task.isPending || (!!task.data && object.isPending)}
      error={task.error ?? history.error ?? profiles.error ?? object.error ?? objects.error}
      onRetry={() => {
        task.refetch()
        history.refetch()
        profiles.refetch()
        if (object.error) object.refetch()
        if (objects.error) objects.refetch()
      }}
      onChangeStatus={(to, comment) => change.mutateAsync({ taskId: id, to, comment })}
      onUpdate={(input) => update.mutateAsync({ id, input })}
      onDelete={async () => {
        const objectId = task.data?.object_id
        await del.mutateAsync(id)
        navigate(objectId ? `/objects/${objectId}` : '/objects', { replace: true })
      }}
    />
  )
}
