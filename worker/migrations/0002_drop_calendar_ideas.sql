-- Calendar and Ideas features were removed from the app.
DROP TABLE IF EXISTS project_notes;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS ideas;
DROP TABLE IF EXISTS events;
DELETE FROM _ver WHERE t IN ('project_notes', 'projects', 'ideas', 'events');
