CREATE DATABASE IF NOT EXISTS gestao_tarefas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gestao_tarefas;

CREATE TABLE IF NOT EXISTS team_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(80) NOT NULL DEFAULT 'Geral',
  email VARCHAR(180) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_team_members_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  due_date DATE NULL,
  department VARCHAR(80) NOT NULL DEFAULT '',
  assignee_id INT UNSIGNED NULL,
  current_since DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_status_due_date (status, due_date),
  INDEX idx_tasks_assignee (assignee_id),
  INDEX idx_tasks_department (department),
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

CREATE TABLE IF NOT EXISTS task_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  member_id INT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_comments_task_created (task_id, created_at),
  CONSTRAINT fk_comments_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_member FOREIGN KEY (member_id)
    REFERENCES team_members (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS task_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  member_id INT UNSIGNED NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_attachments_task_created (task_id, created_at),
  CONSTRAINT fk_attachments_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_member FOREIGN KEY (member_id)
    REFERENCES team_members (id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO team_members (name, email, department)
SELECT 'Maria Silva', 'maria.silva@seaf.mt.gov.br', 'Operações'
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Maria Silva');
INSERT INTO team_members (name, email, department)
SELECT 'Rafael Costa', 'rafael.costa@seaf.mt.gov.br', 'Financeiro'
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Rafael Costa');
INSERT INTO team_members (name, email, department)
SELECT 'Ana Souza', 'ana.souza@seaf.mt.gov.br', 'Atendimento'
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Ana Souza');
INSERT INTO team_members (name, email, department)
SELECT 'Lucas Martins', 'lucas.martins@seaf.mt.gov.br', 'Operações'
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Lucas Martins');
