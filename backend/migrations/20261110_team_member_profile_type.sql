ALTER TABLE team_members
  ADD COLUMN profile_type ENUM('Secretário', 'Gestor', 'Técnico') NOT NULL DEFAULT 'Técnico'
  AFTER name;
