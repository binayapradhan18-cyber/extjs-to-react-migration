import { TaskSchema, type Task } from '@migration/bridge';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { useSaveTask } from '../api/queries';
import { useHost } from '../host/HostProvider';
import { PRIORITIES, TASK_STATUSES } from './taskMeta';

interface TaskFormProps {
  task: Task | null;
  onSaved?: (task: Task) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

export function TaskForm({ task, onSaved, onDirtyChange }: TaskFormProps) {
  const { t } = useHost();
  const save = useSaveTask();
  const id = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Task>({
    resolver: zodResolver(TaskSchema),
    defaultValues: task ?? undefined,
    mode: 'onTouched',
  });

  useEffect(() => {
    if (task) reset(task);
  }, [task, reset]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Zod issue codes map onto the legacy validation keys, so both UIs show identical messages.
  const message = (error: FieldError | undefined) => {
    if (!error) return null;
    const key = error.type === 'too_small' ? 'validation.required' : error.type === 'too_big' ? 'validation.tooLong' : 'validation.invalid';
    return (
      <span role="alert" className="rw-field__error">
        {t(key)}
      </span>
    );
  };

  if (!task) {
    return (
      <aside className="rw-form rw-form--empty" aria-label={t('tasks.form.emptyTitle')}>
        <p>{t('tasks.form.emptyTitle')}</p>
      </aside>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    const saved = await save.mutateAsync(values);
    reset(saved);
    onSaved?.(saved);
  });

  return (
    <form className="rw-form" aria-labelledby={`${id}-title`} onSubmit={(e) => void onSubmit(e)} noValidate>
      <h3 id={`${id}-title`} className="rw-form__title">
        {t('tasks.form.editTitle', task.title)}
      </h3>

      <div className="rw-field">
        <label htmlFor={`${id}-title-input`}>{t('tasks.col.title')}</label>
        <input id={`${id}-title-input`} aria-invalid={Boolean(errors.title)} {...register('title')} />
        {message(errors.title)}
      </div>

      <div className="rw-field">
        <label htmlFor={`${id}-status`}>{t('tasks.col.status')}</label>
        <select id={`${id}-status`} {...register('status')}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`tasks.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="rw-field">
        <label htmlFor={`${id}-priority`}>{t('tasks.col.priority')}</label>
        <select id={`${id}-priority`} {...register('priority', { setValueAs: Number })}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`tasks.priority.${p}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="rw-field">
        <label htmlFor={`${id}-assignee`}>{t('tasks.col.assignee')}</label>
        <input id={`${id}-assignee`} {...register('assignee', { setValueAs: emptyToNull })} />
      </div>

      <div className="rw-field">
        <label htmlFor={`${id}-due`}>{t('tasks.col.dueDate')}</label>
        <input id={`${id}-due`} type="date" aria-invalid={Boolean(errors.dueDate)} {...register('dueDate', { setValueAs: emptyToNull })} />
        {message(errors.dueDate)}
      </div>

      <div className="rw-field">
        <label htmlFor={`${id}-estimate`}>{t('tasks.col.estimate')}</label>
        <input
          id={`${id}-estimate`}
          type="number"
          min={0}
          step={0.5}
          aria-invalid={Boolean(errors.estimateHours)}
          {...register('estimateHours', { valueAsNumber: true })}
        />
        {message(errors.estimateHours)}
      </div>

      <div className="rw-form__actions">
        {save.data?.id === task.id && !isDirty ? (
          <span role="status" className="rw-saved">
            {t('tasks.form.saved')}
          </span>
        ) : null}
        <button type="button" className="rw-btn rw-btn--secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(task)}>
          {t('tasks.form.reset')}
        </button>
        <button type="submit" className="rw-btn" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? t('tasks.form.saving') : t('tasks.form.save')}
        </button>
      </div>
    </form>
  );
}
