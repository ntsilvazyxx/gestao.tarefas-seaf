USE gestao_tarefas;

ALTER TABLE tasks
  MODIFY status ENUM('pending', 'waiting', 'in_progress', 'completed') NOT NULL DEFAULT 'pending';

ALTER TABLE task_history
  MODIFY action ENUM('created', 'forwarded', 'returned', 'completed', 'reopened', 'status_changed') NOT NULL;
