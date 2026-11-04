import { useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  useCreateTask,
  useDeleteObject,
  useObject,
  useObjectTasks,
  useObjects,
  useProfiles,
  useSaveObject,
  type ObjectInput,
  type TaskInput,
} from '../api/queries'
import { ObjectForm, TaskForm } from '../components/forms'
import { Breadcrumbs } from '../components/layout'
import { TaskRow, nameOf } from '../components/tasks'
import { Button, Card, ConfirmDialog, EmptyState, ErrorBox, ListSkeleton, Modal, formatDate } from '../components/ui'
import type { CrmObject, Profile, Task } from '../domain/types'
import { errorText } from '../lib/errors'
import { useAction } from '../lib/useAction'

type Dialog = 'edit' | 'delete' | 'task'

type ObjectViewProps = {
  profile: Profile
  object: CrmObject | null | undefined
  tasks: Task[] | undefined
  profiles: Profile[]
  objects: CrmObject[]
  loading: boolean
  tasksLoading: boolean
  error: unknown
  onRetry: () => void
  onSaveObject: (input: ObjectInput) => Promise<unknown>
  onDeleteObject: () => Promise<unknown>
  onCreateTask: (input: TaskInput) => Promise<unknown>
  demo?: { dialog?: Dialog; error?: string }
}

export function ObjectView(props: ObjectViewProps) {
  const { profile, object, tasks, profiles, objects, loading, tasksLoading, error, onRetry, demo } = props
  const isManager = profile.role === 'manager'
  const [dialog, setDialog] = useState<Dialog | null>(demo?.dialog ?? null)
  const action = useAction()
  const close = () => {
    setDialog(null)
    action.reset()
  }
  const executors = profiles.filter((p) => p.role === 'executor')
  const addTask = <Button onClick={() => setDialog('task')}>Добавить задачу</Button>

  return (
    <>
      <Breadcrumbs items={[{ label: 'Объекты', to: '/objects' }, { label: object?.name ?? 'Объект' }]} />
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorBox message={`Не удалось загрузить объект: ${errorText(error)}`} onRetry={onRetry} />
      ) : !object ? (
        <EmptyState text="Объект не найден или у вас нет к нему доступа." />
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold break-words text-slate-900">{object.name}</h1>
                <p className="text-sm text-slate-600">{object.address}</p>
              </div>
              {isManager && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setDialog('edit')}>
                    Изменить
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDialog('delete')}>
                    Удалить
                  </Button>
                </div>
              )}
            </div>
          </Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Задачи</h2>
            {isManager && addTask}
          </div>
          {tasksLoading ? (
            <ListSkeleton />
          ) : !tasks?.length ? (
            <EmptyState
              text={isManager ? 'На объекте пока нет задач.' : 'На этом объекте у вас нет задач.'}
              action={isManager ? addTask : undefined}
            />
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} subtitle={`${nameOf(profiles, t.assignee_id)} · создана ${formatDate(t.created_at)}`} />
              ))}
            </div>
          )}

          {dialog === 'edit' && (
            <Modal title="Изменить объект" onClose={close} busy={action.pending}>
              <ObjectForm
                initial={object}
                submitLabel="Сохранить"
                pending={action.pending}
                error={action.error ?? demo?.error}
                onCancel={close}
                onSubmit={async (input) => {
                  if (await action.run(() => props.onSaveObject(input))) close()
                }}
              />
            </Modal>
          )}
          {dialog === 'delete' && (
            <ConfirmDialog
              title="Удалить объект"
              text={`Удалить объект «${object.name}»?`}
              confirmLabel="Удалить"
              pending={action.pending}
              error={action.error ?? demo?.error}
              onClose={close}
              onConfirm={() => void action.run(props.onDeleteObject)}
            />
          )}
          {dialog === 'task' && (
            <Modal title="Новая задача" onClose={close} busy={action.pending}>
              <TaskForm
                initial={{ title: '', description: '', object_id: object.id, assignee_id: '' }}
                objects={objects.length ? objects : [object]}
                executors={executors}
                canChangeAssignee
                submitLabel="Создать задачу"
                pending={action.pending}
                error={action.error ?? demo?.error}
                onCancel={close}
                onSubmit={async (values) => {
                  if (await action.run(() => props.onCreateTask(values))) close()
                }}
              />
            </Modal>
          )}
        </>
      )}
    </>
  )
}

export default function ObjectPage() {
  const { id = '' } = useParams()
  const { profile } = useOutletContext<{ profile: Profile }>()
  const navigate = useNavigate()
  const object = useObject(id)
  const tasks = useObjectTasks(id)
  const profiles = useProfiles()
  const objects = useObjects()
  const save = useSaveObject()
  const del = useDeleteObject()
  const create = useCreateTask()
  return (
    <ObjectView
      profile={profile}
      object={object.data}
      tasks={tasks.data}
      profiles={profiles.data ?? []}
      objects={objects.data ?? []}
      loading={object.isPending}
      tasksLoading={tasks.isPending}
      error={object.error ?? tasks.error ?? profiles.error ?? objects.error}
      onRetry={() => {
        object.refetch()
        tasks.refetch()
        profiles.refetch()
        if (objects.error) objects.refetch()
      }}
      onSaveObject={(input) => save.mutateAsync({ id, input })}
      onDeleteObject={async () => {
        await del.mutateAsync(id)
        navigate('/objects', { replace: true })
      }}
      onCreateTask={(input) => create.mutateAsync(input)}
    />
  )
}
