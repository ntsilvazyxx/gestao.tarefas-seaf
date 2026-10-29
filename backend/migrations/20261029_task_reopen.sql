USE gestao_tarefas;

ALTER TABLE task_history
  MODIFY action ENUM('created', 'forwarded', 'returned', 'completed', 'reopened') NOT NULL;
