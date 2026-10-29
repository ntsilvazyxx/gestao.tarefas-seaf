USE gestao_tarefas;

ALTER TABLE task_comments
  DROP FOREIGN KEY fk_comments_member;

ALTER TABLE task_comments
  MODIFY member_id INT UNSIGNED NULL,
  ADD COLUMN author_name VARCHAR(120) NOT NULL DEFAULT 'Usuário' AFTER member_id,
  ADD COLUMN author_email VARCHAR(180) NULL AFTER author_name;

UPDATE task_comments c
JOIN team_members m ON m.id = c.member_id
SET c.author_name = m.name,
    c.author_email = m.email
WHERE c.author_name = 'Usuário';

ALTER TABLE task_comments
  ADD CONSTRAINT fk_comments_member FOREIGN KEY (member_id)
    REFERENCES team_members (id) ON DELETE SET NULL;

ALTER TABLE task_attachments
  DROP FOREIGN KEY fk_attachments_member;

ALTER TABLE task_attachments
  MODIFY member_id INT UNSIGNED NULL,
  ADD COLUMN author_name VARCHAR(120) NOT NULL DEFAULT 'Usuário' AFTER member_id,
  ADD COLUMN author_email VARCHAR(180) NULL AFTER author_name;

UPDATE task_attachments a
JOIN team_members m ON m.id = a.member_id
SET a.author_name = m.name,
    a.author_email = m.email
WHERE a.author_name = 'Usuário';

ALTER TABLE task_attachments
  ADD CONSTRAINT fk_attachments_member FOREIGN KEY (member_id)
    REFERENCES team_members (id) ON DELETE SET NULL;
