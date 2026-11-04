import { useOutletContext } from 'react-router-dom'
import { useMyTasks, useObjects } from '../api/queries'
import { TaskRow } from '../components/tasks'
import { EmptyState, ErrorBox, ListSkeleton, PageTitle, formatDate } from '../components/ui'
import { availableActions } from '../domain/tasks'
import type { CrmObject, Profile, Task } from '../domain/types'
import { errorText } from '../lib/errors'

type MyTasksViewProps = {
  tasks: Task[] | undefined
  objects: CrmObject[]
  loading: boolean
  error: unknown
  onRetry: () => void
}

// Две группы: «Ваш ход» — у исполнителя есть доступное действие; остальные ждут постановщика или приняты.
export function MyTasksView({ tasks, objects, loading, error, onRetry }: MyTasksViewProps) {
  const objectName = (id: string) => objects.find((o) => o.id === id)?.name ?? 'Объект'
  const mine = tasks ?? []
  const groups = [
    { title: 'Ваш ход', items: mine.filter((t) => availableActions(t.status, 'executor', true).length > 0) },
    { title: 'На проверке и принятые', items: mine.filter((t) => availableActions(t.status, 'executor', true).length === 0) },
  ]
  return (
    <>
      <PageTitle title="Мои задачи" />
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorBox message={`Не удалось загрузить задачи: ${errorText(error)}`} onRetry={onRetry} />
      ) : mine.length === 0 ? (
        <EmptyState text="Вам пока не назначено задач." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {g.title} <span className="font-normal text-slate-500">· {g.items.length}</span>
              </h2>
              {g.items.length === 0 ? (
                <p className="text-sm text-slate-500">Пусто.</p>
              ) : (
                <div className="space-y-2">
                  {g.items.map((t) => (
                    <TaskRow key={t.id} task={t} subtitle={`${objectName(t.object_id)} · создана ${formatDate(t.created_at)}`} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}

export default function MyTasksPage() {
  const { profile } = useOutletContext<{ profile: Profile }>()
  const tasks = useMyTasks(profile.id)
  const objects = useObjects()
  return (
    <MyTasksView
      tasks={tasks.data}
      objects={objects.data ?? []}
      loading={tasks.isPending}
      error={tasks.error ?? objects.error}
      onRetry={() => {
        tasks.refetch()
        if (objects.error) objects.refetch()
      }}
    />
  )
}
