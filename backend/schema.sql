CREATE DATABASE IF NOT EXISTS gestao_tarefas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gestao_tarefas;

CREATE TABLE IF NOT EXISTS team_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  due_date DATE NULL,
  assignee_id INT UNSIGNED NULL,
  current_since DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_status_due_date (status, due_date),
  INDEX idx_tasks_assignee (assignee_id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id)
    REFERENCES team_members (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS task_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  action ENUM('created', 'forwarded', 'returned', 'completed') NOT NULL,
  from_member_id INT UNSIGNED NULL,
  to_member_id INT UNSIGNED NULL,
  note VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_history_task_created (task_id, created_at),
  CONSTRAINT fk_history_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_from_member FOREIGN KEY (from_member_id)
    REFERENCES team_members (id) ON DELETE SET NULL,
  CONSTRAINT fk_history_to_member FOREIGN KEY (to_member_id)
    REFERENCES team_members (id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO team_members (name)
SELECT 'Maria Silva' WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Maria Silva');
INSERT INTO team_members (name)
SELECT 'Rafael Costa' WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Rafael Costa');
INSERT INTO team_members (name)
SELECT 'Ana Souza' WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Ana Souza');
INSERT INTO team_members (name)
SELECT 'Lucas Martins' WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Lucas Martins');
